import type { Compiler, Compilation } from "@rspack/core";
import pako from "pako";

import * as acorn from "acorn";
import MagicString from "magic-string";

export function compileDecodeSource(templateCode: string, base64Data: string, vName: string) {
  return `
  const $encodedBase64 = "${base64Data}";

  // -------------- See https://github.com/js-vanilla/inflate-raw/ --------------

  const $inflateRaw = (()=>{const t=Uint8Array,r=t.fromBase64?.bind(t)??(r=>{const e=atob(r);let n=e.length;const l=new t(n);for(;n--;)l[n]=e.charCodeAt(n);return l});
  return e=>{const n=r(e);let l=4*n.length;l<32768&&(l=32768);let s=new t(l),o=0;const a=r=>{let e=s.length;const n=o+r;if(n>e){do{e=3*e>>>1}while(e<n);
  const r=new t(e);r.set(s),s=r}},c=new Uint16Array(66400),f=c.subarray(0,32768),i=c.subarray(32768,65536),u=c.subarray(65536,65856);let y,b;const h=new Int32Array(48);
  let w=0,g=0,d=0;const A=()=>{for(;g<16&&d<n.length;)w|=n[d++]<<g,g+=8},U=t=>{A();const r=w&(1<<t)-1;return w>>>=t,g-=t,r},k=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15],
  m=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258],p=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0],
  v=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577],
  x=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13],B=h.subarray(0,16),C=h.subarray(16,32),D=(t,r)=>{const e=B.fill(0);
  let n=0;for(let r=0;r<t.length;r++){const l=t[r];l>0&&(e[l]++,l>n&&(n=l))}const l=1<<n,s=r.subarray(0,l),o=C;let a=0;for(let t=1;t<=n;t++)o[t]=a,a+=e[t];const c=u;
  for(let r=0;r<t.length;r++)t[r]>0&&(c[o[t[r]]++]=r);let f=0,i=0;for(let t=1;t<=n;t++){const r=1<<t,n=e[t];for(let e=0;e<n;e++){const e=t<<9|c[i++];
  for(let t=f;t<l;t+=r)s[t]=e;let n=1<<t-1;for(;f&n;)f^=n,n>>=1;f^=n}}return s},I=t=>{A();const r=t.length-1,e=t[w&r],n=e>>>9;return w>>>=n,g-=n,511&e},R=new t(320),
  T=R.subarray(0,19);let W=!1,j=0;for(;!j;){const t=U(3);j=1&t;const r=t>>1;if(0===r){w=g=0;const t=n[d++]|n[d++]<<8;d+=2,a(t),s.set(n.subarray(d,d+t),o),o+=t,d+=t}else{
  let t,e;if(1===r){if(!W){W=!0;let t=65856;const r=R.subarray(0,288);r.fill(8,0,144),r.fill(9,144,256),r.fill(7,256,280),r.fill(8,280,288),y=c.subarray(t,t+=512),D(r,y);
  const e=R.subarray(0,32).fill(5);b=c.subarray(t,t+=32),D(e,b)}t=y,e=b}else{const r=U(14),n=257+(31&r),l=1+(r>>5&31),s=4+(r>>10&15);T.fill(0);
  for(let t=0;t<s;t++)T[k[t]]=U(3);const o=D(T,f),a=n+l,c=R.subarray(0,a).fill(0);let u=0;for(;u<a;){const t=I(o);if(t<16)c[u++]=t;else{let r=0,e=0;
  for(16===t?(r=3+U(2),e=c[u-1]):r=17===t?3+U(3):11+U(7);r--;)c[u++]=e}}t=D(c.subarray(0,n),f),e=D(c.subarray(n),i)}for(;;){const r=I(t);
  if(r<256)a(1),s[o++]=r;else{if(256===r)break;{const t=r-257;let n=m[t]+U(p[t]);const l=I(e),c=v[l]+U(x[l]);a(n);let f=o-c;if(n<=8)for(;n--;)s[o++]=s[f++];else{
  const t=o+n;for(;o<t;){const r=t-o,e=o-f,n=r<e?r:e;s.copyWithin(o,f,f+n),o+=n}}}}}}}return(new TextDecoder).decode(s.subarray(0,o))}})();

  // -----------------------------------------------------------------------------

  const $decodedText = $inflateRaw($encodedBase64);
  const ${vName} = JSON.parse($decodedText);
  ${templateCode}
`.trim();
}

interface Candidate {
  id: number; // final index in zzstrs[]
  type: "Template" | "Literal";
  start: number;
  end: number;
  expressions?: number;
  value: string; // runtime value (with real \n etc.)
}

const findAvailableVarName = (source: string) => {
  // "zzstrs"
  for (let e = 0xc0; e <= 0xff; e++) {
    if (e === 0xd7 || e === 0xf7) continue;
    const c = "$" + String.fromCharCode(e);
    if (source.includes(c)) continue;
    return c;
  }
  throw new Error("Unable to compress");
};

export class ZipExecutionPlugin {
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

            const source = asset.source().toString();

            const vName = findAvailableVarName(source);

            // ──────────────────────────────────────────────────────────────
            // 1. Parse (no regex hacks!)
            let ast: acorn.Node;
            try {
              ast = acorn.parse(source, {
                ecmaVersion: "latest",
                sourceType: "module",
                ranges: true,
              });
            } catch (err) {
              console.warn(`[ZipExec] Parse failed ${filename}:`, (err as Error).message);
              continue;
            }

            // ──────────────────────────────────────────────────────────────
            // 2. Collect candidates (robust walker + context)
            const candidates = this.collectCandidates(ast);

            if (candidates.length === 0) continue;

            // ──────────────────────────────────────────────────────────────
            // 3. Normalise values + deduplicate (huge strings are rarely identical, but helps)
            const extracted: string[] = [];
            const operations: Candidate[] = [];

            const candidatesFreq = new Map<string, [number, number]>();
            const mapped = candidates.map((c) => {
              const d = this.normalizeValue(c.value);
              let q = candidatesFreq.get(d);
              if (!q) candidatesFreq.set(d, (q = [0, 0]));
              q[0] += 1;
              return [c, d, q] as const;
            });
            const sorted = [...candidatesFreq.entries()].sort((a, b) => b[1][0] - a[1][0]);
            let i = 0;
            for (const [d, q] of sorted) {
              q[1] = i++;
              extracted.push(d);
            }
            candidatesFreq.clear();

            mapped.forEach(([c, _d, q]: any) => {
              const id = q[1] as number;
              operations.push({ ...c, id });
            });
            mapped.length = 0;

            // ──────────────────────────────────────────────────────────────
            // 4. Replace bottom-up (safe offsets)
            operations.sort((a, b) => b.start - a.start);

            const ms = new MagicString(source);

            for (const op of operations) {
              if (op.type === "Template") {
                // `content` → `${zzstrs[N]}`
                if (op.expressions === 0) {
                  ms.overwrite(op.start - 1, op.end + 1, `${vName}[${op.id}]`);
                } else if (op.expressions) {
                  throw "not implemented yet";
                  // ms.overwrite(op.start, op.end, `\${${vName}[${op.id}]}`);
                }
              } else {
                // "content" or 'content' → zzstrs[N]
                ms.overwrite(op.start, op.end, ` ${vName}[${op.id}] `);
              }
            }

            // ──────────────────────────────────────────────────────────────
            // 5. Compress
            const json = JSON.stringify(extracted);
            const deflated = pako.deflateRaw(Buffer.from(json, "utf8"), { level: 6 });
            if (!deflated) throw new Error("Pako Compression Failed");
            const base64 = Buffer.from(deflated).toString("base64");

            // ──────────────────────────────────────────────────────────────
            // 6. Wrap
            const finalSource = compileDecodeSource(ms.toString(), base64, vName);

            compilation.updateAsset(filename, new compiler.webpack.sources.RawSource(finalSource));

            console.log(`[ZipExecutionPlugin] Processed ${filename}: ${extracted.length} unique strings extracted`);
          }
        }
      );
    });
  }

  private collectCandidates(ast: acorn.Node): Omit<Candidate, "id">[] {
    const results: Omit<Candidate, "id">[] = [];

    const walk = (node: any, parent: any = null) => {
      if (!node || typeof node !== "object") return;

      if (this.isExtractable(node, parent)) {
        if (node.type === "Literal" && typeof node.value === "string") {
          results.push({
            type: "Literal",
            start: node.start!,
            end: node.end!,
            value: node.value,
          });
          return; // no children
        }

        // for node.expressions.length > 0, not implemented yet
        if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
          const quasi = node.quasis[0];
          const value = quasi.value.cooked ?? quasi.value.raw;
          results.push({
            type: "Template",
            start: quasi.start!,
            end: quasi.end!,
            expressions: node.expressions.length,
            value,
          });
          return;
        }
      }

      // Safe child traversal
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

  private isExtractable(node: any, parent: any): boolean {
    const isLiteral = node.type === "Literal" && typeof node.value === "string";
    const isTemplate = node.type === "TemplateLiteral";

    if (!isLiteral && !isTemplate) return false;

    // Length filter (runtime value)
    const content = isLiteral ? node.value : (node.quasis[0].value.cooked ?? "");
    if (isTemplate && node.expressions?.length === 0) {
      if (content.length < 7) return false; // `1234567` => $S[6789]
    } else {
      // isLiteral or isTemplate with node.expressions
      if (content.length < 9) return false; // "123456789" => ($S[6789])
    }

    // ── Exclusions ─────────────────────────────────────────────────────
    // "use strict"
    if (parent?.type === "ExpressionStatement" && node.value === "use strict") return false;

    // Tagged templates
    if (parent?.type === "TaggedTemplateExpression" && parent.quasi === node) return false;

    // Object keys (non-computed)
    if (parent?.type === "Property" && parent.key === node && !parent.computed) return false;

    // Import/export sources
    if (
      parent &&
      (parent.type === "ImportDeclaration" ||
        parent.type === "ExportNamedDeclaration" ||
        parent.type === "ExportAllDeclaration") &&
      parent.source === node
    )
      return false;

    // Dynamic import
    if (parent?.type === "ImportExpression" && parent.source === node) return false;

    return true;
  }

  private normalizeValue(value: string): string {
    // Only standardise line endings – never escape anything
    return value.includes("\r") ? value.replace(/\r\n/g, "\n").replace(/\r/g, "\n") : value;
  }
}
