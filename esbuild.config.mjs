import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "node:module";
import { copyFile, mkdir } from "node:fs/promises";

const prod = process.argv[2] === "production";
const outdir = prod ? "." : "test-vault/.obsidian/plugins/transclusion-extractor";

const copyStatic = {
  name: "copy-static",
  setup(build) {
    build.onEnd(async () => {
      if (prod) return;
      await mkdir(outdir, { recursive: true });
      for (const f of ["manifest.json", "styles.css"]) await copyFile(f, `${outdir}/${f}`);
    });
  },
};

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  minify: prod,
  outfile: `${outdir}/main.js`,
  plugins: [copyStatic],
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
