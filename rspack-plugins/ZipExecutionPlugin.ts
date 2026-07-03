import type { Compiler, Compilation } from "@rspack/core";
import { deflateRawSync } from "zlib";

import * as acorn from "acorn";
import MagicString from "magic-string";
import { minify } from "uglify-js";

// 先保留 trimCode
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const trimCode = (code: string) => {
  return code.replace(/[\r\n]\s+/g, "").trim();
};

/**
 * ## inflate-raw
 * * 轻量级的 DEFLATE 解压算法实现（遵循 RFC 1951），内联进插件以避免额外依赖
 * * 实现参考：https://github.com/js-vanilla/inflate-raw/ 仅做格式压缩与封装用于运行时解码
 * * lightweight implementation of the DEFLATE decompression algorithm (RFC 1951)
 * * See https://github.com/js-vanilla/inflate-raw/
 */
const inflateRawCode = minify(
  `const $inflateRaw_ = (() => {
      const Uint8Arr = Uint8Array;

      const $fromBase64 = Uint8Arr.fromBase64?.bind(Uint8Arr) ?? ((b64) => {
        const binStr = atob(b64);
        let n = binStr.length;
        const input = new Uint8Arr(n);
        while (n--) input[n] = binStr.charCodeAt(n);
        return input;
      });

      const $inflate = (b64) => {
        const input = $fromBase64(b64);

        // Output Buffer (Standard)
        let outSize = input.length * 4;
        if (outSize < 32768) outSize = 32768;
        let out = new Uint8Arr(outSize);
        let outIdx = 0;
        const ensure = (need) => {
          let n = out.length;
          const required = outIdx + need;
          if (required > n) {
            do { n = (n * 3) >>> 1; } while (n < required);
            const newOut = new Uint8Arr(n);
            newOut.set(out);
            out = newOut;
          }
        };

        // --- MEMORY OPTIMIZATION ---
        // We reuse these for every block to avoid Garbage Collection churn.
        const tableMemory = new Uint16Array(65536 + 320 + 512 + 32);
        const lTable = tableMemory.subarray(0, 32768); // Shared for Literals & CodeLengths
        const dTable = tableMemory.subarray(32768, 65536); // Shared for Distances
        const sortedSymsMem = tableMemory.subarray(65536, 65536 + 320); // size = 320
        let lxTree; // size = 512
        let dxTree; // size = 32
        const treeMemory = new Int32Array(48); // Small temp buffer

        // Bit Reader
        let bitBuf = 0, bitLen = 0, inpIdx = 0;
        const refill = () => {
          while (bitLen < 16 && inpIdx < input.length) {
            bitBuf |= input[inpIdx++] << bitLen;
            bitLen += 8;
          }
        };
        const readBits = (n) => {
          refill();
          const res = bitBuf & ((1 << n) - 1);
          bitBuf >>>= n;
          bitLen -= n;
          return res;
        };

        // Constants
        const ord = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
        const lensOf0 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
        const ex0 = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
        const distsOf1 = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
        const ex1 = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

        const countsMem = treeMemory.subarray(0, 16);
        const offsetsMem = treeMemory.subarray(16, 32);
        // Modified buildTree: Accepts a target buffer (lut) to fill
        const buildTree = (lens, lut) => {
          const counts = countsMem.fill(0);
          let maxBits = 0;
          for (let i = 0; i < lens.length; i++) {
            const l = lens[i];
            if (l > 0) {
              counts[l]++;
              if (l > maxBits) maxBits = l;
            }
          }

          const limit = 1 << maxBits;
          const resLut = lut.subarray(0, limit);
          const offsets = offsetsMem;
          let off = 0;
          for (let i = 1; i <= maxBits; i++) {
            offsets[i] = off;
            off += counts[i];
          }

          const sorted = sortedSymsMem;
          for (let i = 0; i < lens.length; i++) {
            if (lens[i] > 0) sorted[offsets[lens[i]]++] = i;
          }

          let rev = 0;
          let sortedIdx = 0;
          for (let len = 1; len <= maxBits; len++) {
            const step = 1 << len;
            const count = counts[len];
            for (let i = 0; i < count; i++) {
              const sym = sorted[sortedIdx++];
              const entry = (len << 9) | sym;

              // Fill all indices in the LUT that share this bit-reversed prefix
              for (let j = rev; j < limit; j += step) resLut[j] = entry;

              // Increment 'rev' in bit-reversed order:
              // Propagate carry from the MSB (at position len-1) down to the LSB
              let bit = 1 << (len - 1);
              while (rev & bit) {
                rev ^= bit;
                bit >>= 1;
              }
              rev ^= bit;
            }
          }
          return resLut;
        };

        const decodeSymbol = (lut) => {
          refill();
          // Mask allows us to use smaller tables for smaller trees
          const bitMask = lut.length - 1;
          const entry = lut[bitBuf & bitMask];
          const len = entry >>> 9;
          bitBuf >>>= len;
          bitLen -= len;
          return entry & 0x1FF;
        };

        // Temp buffers
        const ms = new Uint8Arr(320);
        const clens = ms.subarray(0, 19);

        let fixedTreeOk = false;

        // Main Loop
        let isFinal = 0;
        while (!isFinal) {
          const bits = readBits(3);
          isFinal = bits & 1;
          const type = bits >> 1;

          if (type === 0) { // Uncompressed
            bitBuf = bitLen = 0;
            const len = input[inpIdx++] | (input[inpIdx++] << 8);
            inpIdx += 2; // Skip nlen
            ensure(len);
            out.set(input.subarray(inpIdx, inpIdx + len), outIdx);
            outIdx += len;
            inpIdx += len;

          } else { // Compressed
            let lTree, dTree;

            if (type === 1) { // Fixed
              if (!fixedTreeOk) {
                fixedTreeOk = true;
                let offset = 65536 + 320;

                const ls = ms.subarray(0, 288);
                ls.fill(8, 0, 144); ls.fill(9, 144, 256); ls.fill(7, 256, 280); ls.fill(8, 280, 288);
                lxTree = tableMemory.subarray(offset, (offset += 512));
                buildTree(ls, lxTree);

                const ds = ms.subarray(0, 32).fill(5);
                dxTree = tableMemory.subarray(offset, (offset += 32));
                buildTree(ds, dxTree);
              }
              lTree = lxTree;
              dTree = dxTree;

            } else { // Dynamic
              const bits = readBits(14);
              const hlit = (bits & 0b11111) + 257;
              const hdist = ((bits >> 5) & 0b11111) + 1;
              const hclen = ((bits >> 10) & 0b1111) + 4;

              clens.fill(0);
              for (let i = 0; i < hclen; i++) clens[ord[i]] = readBits(3);

              // Use lTable temporarily for Code Length tree
              const clTree = buildTree(clens, lTable);

              const hLen = hlit + hdist;
              const allLens = ms.subarray(0, hLen).fill(0);

              let i = 0;
              while (i < hLen) {
                const s = decodeSymbol(clTree);
                if (s < 16) allLens[i++] = s;
                else {
                  let r = 0, val = 0;
                  if (s === 16) { r = 3 + readBits(2); val = allLens[i - 1]; }
                  else if (s === 17) { r = 3 + readBits(3); }
                  else { r = 11 + readBits(7); }
                  while (r--) allLens[i++] = val;
                }
              }
              // Now build actual trees into their respective buffers
              lTree = buildTree(allLens.subarray(0, hlit), lTable);
              dTree = buildTree(allLens.subarray(hlit), dTable);
            }

            // Decode Huffman Block
            while (true) {
              const s = decodeSymbol(lTree);
              if (s < 256) {
                ensure(1);
                out[outIdx++] = s;
              } else if (s === 256) {
                break;
              } else {
                const si = s - 257;
                let len = lensOf0[si] + readBits(ex0[si]);
                const di = decodeSymbol(dTree);
                const dist = distsOf1[di] + readBits(ex1[di]);

                ensure(len);
                // Match Copy
                const pos = outIdx - dist;
                // Efficiently handle RLE or very small distances
                if (dist === 1) {
                  // Case 1: High-speed RLE (1-byte pattern)
                  out.fill(out[pos], outIdx, (outIdx += len));
                } else {
                  // Case 2: Exponential Growing Window
                  while (len > 0) {
                    let chunk = outIdx - pos;
                    if (len < chunk) chunk = len; // dist grows every iteration
                    out.set(out.subarray(pos, pos + chunk), outIdx);
                    outIdx += chunk;
                    len -= chunk;
                  }
                }
              }
            }
          }
        }
        return new TextDecoder().decode(out.subarray(0, outIdx));
      };

      return $inflate;

  })();`,
  {
    parse: {},
    compress: false,
    mangle: false,
    output: {
      beautify: true,
      quote_style: 3, // original
      wrap_iife: false,
      indent_level: 2,
      indent_start: 0,
      comments: false,
      braces: false,
      ascii_only: false,
      annotations: false,
      preamble: [
        "// lightweight implementation of the DEFLATE decompression algorithm (RFC 1951)",
        "// * See https://github.com/js-vanilla/inflate-raw/",
      ].join("\n"),
    },
  }
).code;

export function compileDecodeSource(templateCode: string, base64Data: string, pName: string) {
  return [
    `const $b64_ = "${base64Data}";`,
    `${inflateRawCode}`,
    `const $text_ = $inflateRaw_($b64_);`,
    `const ${pName} = JSON.parse($text_);`,
    `${templateCode}`,
  ].join("\n");
}

interface Candidate {
  id: number;
  d: string;
  type: "Template" | "Literal" | "Quasi";
  start: number;
  end: number;
  value: string;
  zz: boolean;
  prefix: string; // store " " or ""
  suffix: string; // store " " or ""
  freq?: number;
}

const findAvailableVarName = (source: string) => {
  // "zzstrs"
  for (let e = 0xc0; e <= 0xff; e++) {
    if (e === 0xd7 || e === 0xf7) continue;
    const c = "$" + String.fromCharCode(e);
    if (!source.includes(c)) return c;
  }
  throw new Error("Unable to compress");
};

// 先保留 findShortName
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const findShortName = (source: string) => {
  // $H
  const filterFn = (w: string, i: number) => i === 0 || !/[\w$]/.test(w[0]);
  const candidates = [..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"].map(
    (c) => [c, source.split("$" + c).filter(filterFn).length] as const
  );
  candidates.sort((a, b) => a[1] - b[1]);
  const [candidateChar, _candidatesFreq] = candidates[0];
  const pName = "$" + candidateChar;
  return pName;
};

export class ZipExecutionPlugin {
  processFn(source: string, filename: string = "") {
    // const vName = findAvailableVarName(source);
    // const pName = findShortName(source);
    // source = source.replaceAll(pName, vName);
    const pName = findAvailableVarName(source);

    // 1. Parse
    let ast: acorn.Node;
    try {
      ast = acorn.parse(source, {
        ecmaVersion: "latest",
        sourceType: "module",
        ranges: true,
      });
    } catch (err) {
      console.warn(`[ZipExec] Parse failed ${filename}:`, (err as Error).message);
      return false;
    }

    // 2. Collect candidates (robust walker + context)
    const candidates = this.collectCandidates(ast, source);
    if (candidates.length === 0) return false;

    // Normalization & Deduplication
    const extracted: string[] = [];
    const operations: Candidate[] = [];
    const candidatesFreq = new Map<string, [number, number, number]>();

    let mapped = candidates.map((c) => {
      const d = this.normalizeValue(c.value);
      if (c.zz) {
        let q = candidatesFreq.get(d);
        if (!q) candidatesFreq.set(d, (q = [0, 0, d.length]));
        q[0] += 1;
        return [c, d, q] as const;
      } else {
        return [c, d, [0, 0, 0]] as const;
      }
    });

    mapped = mapped.filter(([c, d, q]) => {
      if (q[0] === 1) {
        // for freq === 1, if the size difference is small, replacement will make the compressed coding longer.
        if (d.length < 14) {
          q[0] = 0;
          q[1] = 0;
          q[2] = 0;
          c.zz = false;
        }
      }
      return true;
    });

    const sorted = [...candidatesFreq.entries()].sort((a, b) => b[1][0] - a[1][0]);
    let i = 0;
    for (const [d, q] of sorted) {
      if (q[0] > 0) {
        q[1] = i++;
        extracted.push(d);
      }
    }

    for (const [c, d, q] of mapped) {
      operations.push({ ...c, d: d, id: q[1], freq: q[0] });
    }

    // Replace bottom-up (safe offsets)
    operations.sort((a, b) => b.start - a.start);
    const ms = new MagicString(source);
    const usedIds = new Set();

    for (const op of operations) {
      let doZZ = false;
      const p = op.type === "Template" ? op.start - 1 : op.start;
      const q = op.type === "Template" ? op.end + 1 : op.end;
      if (op.zz) {
        const freq = op.freq || 0;
        if (freq === 0) throw new Error("invalid freq");
        const newValue = `${pName}[${op.id}]`;

        let oldSize;

        let r;
        if (op.type === "Template") {
          // Static template: removes backticks
          // someFn(`1234567`) -> someFn($X[1234])
          r = `${op.prefix}${newValue}${op.suffix}`;
          oldSize = op.end - op.start + 2; // opValue = targetString
        } else if (op.type === "Quasi") {
          // Quasi: stays inside backticks
          // someFn(`...${123456789}...`) -> someFn(`...${$X[1234]}...`)
          r = `\${${newValue}}`;
          oldSize = op.end - op.start; // opValue = targetString
        } else {
          // Literal: removes quotes
          // someFn("1234567") -> someFn($X[1234])
          // note: case"12345678" -> case $X[1234]
          r = `${op.prefix}${newValue}${op.suffix}`;
          oldSize = op.end - op.start; // opValue = "targetString"
        }

        const newSize = r.length;
        if (newSize > oldSize) {
          //@ts-ignore : ignore empty value
          extracted[op.id] = 0; // No replacement to $X. Just keep the id in $X
        } else {
          doZZ = true;
          usedIds.add(op.id);
          ms.overwrite(p, q, r);
        }
      }
      if (!doZZ) {
        // Handling non-compressed strings (like those with newlines)
        const old = op.value;
        if (/[\r\n]/.test(old)) {
          if (op.type === "Template") {
            ms.overwrite(op.start - 1, op.end + 1, JSON.stringify(op.d));
          } else if (op.type === "Quasi" && /^[\r\n\w$.=*,?:!(){}[\]@#%^&*/ '"+-]+$/.test(old)) {
            ms.overwrite(op.start, op.end, op.d.replace(/\n/g, "\\n"));
          }
        }
      }
    }

    // Compress
    const json = JSON.stringify(extracted);
    // const deflated = pako.deflateRaw(Buffer.from(json, "utf8"), { level: 6 });
    const deflated = deflateRawSync(Buffer.from(json, "utf8"), { level: 6 });
    if (!deflated) throw new Error("Compression Failed");
    const base64 = Buffer.from(deflated).toString("base64");

    // Wrap
    const finalSource = compileDecodeSource(ms.toString(), base64, pName);
    // testing:
    // const finalSource = `var ${vName}=JSON.parse(new TextDecoder().decode(require('pako').inflateRaw(Buffer.from("${base64}","base64"))));\n${ms.toString()}`;

    return { finalSource, source, extracted, usedIds };
  }
  apply(compiler: Compiler) {
    compiler.hooks.thisCompilation.tap("ZipExecutionPlugin", (compilation: Compilation) => {
      compilation.hooks.processAssets.tapPromise(
        {
          name: "ZipExecutionPlugin",
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE, // after all compressions
        },
        async (assets) => {
          for (const [filename, asset] of Object.entries(assets)) {
            if (!filename.endsWith("ts.worker.js")) continue;

            let source = asset.source().toString();

            const ret = this.processFn(source, filename);
            if (ret === false) continue;
            source = ret.source;
            const { finalSource, extracted, usedIds } = ret;

            compilation.updateAsset(filename, new compiler.webpack.sources.RawSource(finalSource));

            console.debug(`[ZipExecutionPlugin] Processed ${filename}: ${extracted.length} unique strings extracted`);
            console.debug(`[ZipExecutionPlugin] Replaced ${usedIds.size} extractions`);
          }
        }
      );
    });
  }

  private collectCandidates(ast: acorn.Node, source: string): Omit<Candidate, "id" | "d">[] {
    const results: Omit<Candidate, "id" | "d">[] = [];

    const getPadding = (start: number, end: number) => {
      //xy"abcd"jk
      //3 7
      //s[3-1] = s[2] = "
      //s[7+1] = s[8] = j
      const c1 = source[start - 1] || "";
      const c2 = source[end] || "";
      const isWord = /[\w$"'`]/;
      return {
        prefix: isWord.test(c1) ? " " : "",
        suffix: isWord.test(c2) ? " " : "",
      };
    };

    const walk = (node: any, parent: any = null) => {
      if (!node || typeof node !== "object") return;

      if (node.type === "Literal" && typeof node.value === "string") {
        if (this.isExtractable(node, parent, "Literal")) {
          const { prefix, suffix } = getPadding(node.start, node.end);
          const oriLen = node.end - node.start; // "targetString"
          // someFn("123456") -> someFn($X[1234])
          // note: case"1234567" -> case $X[1234]
          const isZZ = oriLen >= 8 + prefix.length + suffix.length;
          if (isZZ) {
            results.push({
              type: "Literal",
              start: node.start,
              end: node.end,
              value: node.value,
              zz: true,
              prefix,
              suffix,
            });
          }
        }
      } else if (node.type === "TemplateLiteral") {
        if (node.expressions.length === 0) {
          // Static Template: treat as one unit
          const quasi = node.quasis[0];
          const val = quasi.value.cooked ?? quasi.value.raw;
          if (this.isExtractable(quasi, parent, "Template")) {
            // Templates overwrite backticks, so peek 1 char further out
            // someFn(`123456`) -> someFn($X[1234])
            // node = `Template`
            // quasi = Template
            const { prefix, suffix } = getPadding(quasi.start - 1, quasi.end + 1);
            const oriLen = quasi.end - quasi.start; // targetString
            const isZZ = oriLen >= 6 + prefix.length + suffix.length;
            const hasNewline = val.includes("\n") || val.includes("\r");
            if (isZZ || hasNewline) {
              results.push({
                type: "Template",
                start: quasi.start,
                end: quasi.end,
                value: val,
                zz: isZZ,
                prefix: isZZ ? prefix : "",
                suffix: isZZ ? suffix : "",
              });
            }
          }
        } else {
          // Complex Template: extract individual quasis
          for (const quasi of node.quasis) {
            const val = quasi.value.cooked ?? quasi.value.raw;
            if (val && this.isExtractable(quasi, parent, "Quasi", val)) {
              // Quasis are inside `${}`, usually don't need padding relative to word boundaries
              // `${...}123456789ab${...}` -> `${...}${$X[1234]}${...}`
              const oriLen = quasi.end - quasi.start; // `${...}targetString${...}`
              const isZZ = oriLen >= 11;
              const hasNewline = val.includes("\n") || val.includes("\r");
              if (isZZ || hasNewline) {
                results.push({
                  type: "Quasi",
                  start: quasi.start,
                  end: quasi.end,
                  value: val,
                  zz: isZZ,
                  prefix: "",
                  suffix: "",
                });
              }
            }
          }
        }
      }

      for (const key of Object.keys(node)) {
        if (["parent", "loc", "range", "start", "end"].includes(key)) continue;
        const child = node[key];
        if (Array.isArray(child)) for (const c of child) walk(c, node);
        else if (child && typeof child === "object" && child.type) walk(child, node);
      }
    };

    walk(ast);
    return results;
  }

  private isExtractable(node: any, parent: any, type: "Literal" | "Template" | "Quasi", overrideVal?: string): boolean {
    const content = overrideVal ?? (node.type === "Literal" ? node.value : (node.value.cooked ?? ""));

    // Thresholds: Quasis need more length because they add `${}` (3 chars)
    // if (type === "Quasi" && content.length < 12) return false;
    // if (type === "Template" && content.length < 7) return false;
    // if (type === "Literal" && content.length < 9) return false;

    // ---- Exclusions ----

    // "use strict"
    if (parent?.type === "ExpressionStatement" && content === "use strict") return false;

    // Tagged templates but type is not "Quasi"
    if (parent?.type === "TaggedTemplateExpression" && type !== "Quasi") return false;

    // Object keys (non-computed)
    if (parent?.type === "Property" && parent.key === node && !parent.computed) return false;

    // Import/export sources
    const isModuleSource =
      parent &&
      (parent.type === "ImportDeclaration" ||
        parent.type === "ExportNamedDeclaration" ||
        parent.type === "ExportAllDeclaration") &&
      parent.source === node;
    if (isModuleSource) return false;

    // Dynamic import
    if (parent?.type === "ImportExpression" && parent.source === node) return false;

    return true;
  }

  private normalizeValue(value: string): string {
    if (value.includes("\r")) {
      value = value.replace(/\r\n|\r/g, "\n");
    }
    return value;
  }
}
