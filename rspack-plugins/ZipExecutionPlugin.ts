import type { Compiler, Compilation } from "@rspack/core";
import zlib from "zlib";

import * as acorn from "acorn";
import MagicString from "magic-string";

const trimCode = (code: string) => {
  return code.replace(/[\r\n]\s+/g, "").trim();
};

export function compileDecodeSource(templateCode: string, base64Data: string, pName: string) {
  // ------------------------------------------ inflate-raw ------------------------------------------
  // lightweight implementation of the DEFLATE decompression algorithm (RFC 1951)
  // * See https://github.com/js-vanilla/inflate-raw/
  const inflateRawCode = trimCode(`
  (()=>{let _=Uint8Array,e=_.fromBase64?.bind(_)??(e=>{let l=atob(e),$=l.length,r=new _($);for(;$--;)r[$]=l.charCodeAt($);return r}),
  l=l=>{let $=e(l),r=4*$.length;r<32768&&(r=32768);let t=new _(r),a=0,f=e=>{let l=t.length,$=a+e;if($>l){do l=3*l>>>1;while(l<$);
  let r=new _(l);r.set(t),t=r}},s=new Uint16Array(66400),u=s.subarray(0,32768),b=s.subarray(32768,65536),n=s.subarray(65536,65856),i,
  o,y=new Int32Array(48),h=0,w=0,g=0,d=()=>{for(;w<16&&g<$.length;)h|=$[g++]<<w,w+=8},c=_=>{d();let e=h&(1<<_)-1;return h>>>=_,w-=_,e},
  F=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15],k=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258],
  m=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0],v=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577],
  x=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13],A=y.subarray(0,16),B=y.subarray(16,32),C=(_,e)=>{let l=A.fill(0),$=0;for(let r=0;r<_.length;r++){
  let t=_[r];t>0&&(l[t]++,t>$&&($=t))}let a=1<<$,f=e.subarray(0,a),s=B,u=0;for(let b=1;b<=$;b++)s[b]=u,u+=l[b];let i=n;for(let o=0;o<_.length;o++)_[o]>0&&(i[s[_[o]]++]=o);
  let y=0,h=0;for(let w=1;w<=$;w++){let g=1<<w,d=l[w];for(let c=0;c<d;c++){let F=i[h++],k=w<<9|F;for(let m=y;m<a;m+=g)f[m]=k;let v=1<<w-1;for(;y&v;)y^=v,v>>=1;y^=v}}return f},
  R=_=>{d();let e=_.length-1,l=_[h&e],$=l>>>9;return h>>>=$,w-=$,511&l},j=new _(320),p=j.subarray(0,19),q=!1,z=0;for(;!z;){let D=c(3);z=1&D;let E=D>>1;if(0===E){
  h=w=0;let G=$[g++]|$[g++]<<8;g+=2,f(G),t.set($.subarray(g,g+G),a),a+=G,g+=G}else{let H,I;if(1===E){if(!q){q=!0;let J=65856,K=j.subarray(0,288);K.fill(8,0,144),K.fill(9,144,256),
  K.fill(7,256,280),K.fill(8,280,288),C(K,i=s.subarray(J,J+=512));let L=j.subarray(0,32).fill(5);C(L,o=s.subarray(J,J+=32))}H=i,I=o}else{let M=c(14),N=(31&M)+257,O=(M>>5&31)+1,
  P=(M>>10&15)+4;p.fill(0);for(let Q=0;Q<P;Q++)p[F[Q]]=c(3);let S=C(p,u),T=N+O,U=j.subarray(0,T).fill(0),V=0;for(;V<T;){let W=R(S);if(W<16)U[V++]=W;else{let X=0,Y=0;
  for(16===W?(X=3+c(2),Y=U[V-1]):X=17===W?3+c(3):11+c(7);X--;)U[V++]=Y}}H=C(U.subarray(0,N),u),I=C(U.subarray(N),b)}for(;;){let Z=R(H);
  if(Z<256)f(1),t[a++]=Z;else if(256===Z)break;else{let __=Z-257,_e=k[__]+c(m[__]),_l=R(I),_$=v[_l]+c(x[_l]);f(_e);let _r=a-_$;if(1===_$)t.fill(t[_r],a,a+=_e);else for(;_e>0;){
  let _t=a-_r;_e<_t&&(_t=_e),t.set(t.subarray(_r,_r+_t),a),a+=_t,_e-=_t}}}}}return new TextDecoder().decode(t.subarray(0,a))};return l})();
  `);
  // -------------------------------------------------------------------------------------------------
  return `
  const $b64_ = "${base64Data}";
  const $inflateRaw_ = ${inflateRawCode};
  const $text_ = $inflateRaw_($b64_);
  const ${pName} = JSON.parse($text_);
  ${templateCode}
`;
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

const findShortName = (source: string) => {
  // $H
  const candidates = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    .split("")
    .map((c) => [c, source.split("$" + c).filter((w, i) => i === 0 || !/[\w$]/.test(w[0])).length] as const);
  candidates.sort((a, b) => a[1] - b[1]);
  const [candidateChar, _candidatesFreq] = candidates[0];
  const pName = "$" + candidateChar;
  return pName;
};

export class ZipExecutionPlugin {
  processFn(source: string, filename: string = "") {
    const vName = findAvailableVarName(source);
    const pName = findShortName(source);
    source = source.replaceAll(pName, vName);

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

    mapped.forEach(([c, d, q]) => {
      operations.push({ ...c, d: d, id: q[1], freq: q[0] });
    });

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
    const deflated = zlib.deflateRawSync(Buffer.from(json, "utf8"), { level: 6 });
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
            if (!filename.includes("ts.worker.js")) continue;

            let source = asset.source().toString();

            // const ss = this.processFn("switch(e){case\"string_Case1_string\":33;case\"string_Case2_string\":44};\nconst p={s:\"string_Var1_string\",f:`string_Var2_string`,e:\"string_Var3_string\"};");
            // console.log(21399, ss);

            // await new Promise(r => setTimeout(r, 300000));

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
          node.quasis.forEach((quasi: any) => {
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
          });
        }
      }

      for (const key of Object.keys(node)) {
        if (["parent", "loc", "range", "start", "end"].includes(key)) continue;
        const child = node[key];
        if (Array.isArray(child)) child.forEach((c) => walk(c, node));
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
    return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }
}
