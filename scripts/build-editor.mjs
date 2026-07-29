import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "apps-script-source");
const publicDir = path.join(root, "public");
const editorDir = path.join(publicDir, "editor");
const adminDir = path.join(publicDir, "admin");

const includePattern = /<\?!=\s*include\(['"]([^'"]+)['"]\);\s*\?>/g;

async function readSource(name) {
  return readFile(path.join(sourceDir, name), "utf8");
}

async function buildEditor() {
  let html = await readSource("Index.html");
  const includes = [...html.matchAll(includePattern)].map((match) => match[1]);

  for (const name of includes) {
    const fragment = await readSource(`${name}.html`);
    html = html.replace(
      new RegExp(
        `<\\?!=\\s*include\\(['"]${name}['"]\\);\\s*\\?>`,
        "g",
      ),
      fragment,
    );
  }

  html = html
    .replace("<base target=\"_top\">", "<base href=\"/editor/\" target=\"_top\">")
    .replace(
      "</head>",
      "  <script src=\"google-script-run.js\"></script>\n</head>",
    );

  await mkdir(editorDir, { recursive: true });
  await writeFile(path.join(editorDir, "index.html"), html, "utf8");
  await cp(
    path.join(root, "src", "client", "google-script-run.js"),
    path.join(editorDir, "google-script-run.js"),
  );
}

async function buildLanding() {
  await Promise.all([
    cp(path.join(root, "index.html"), path.join(publicDir, "index.html")),
    cp(path.join(root, "styles.css"), path.join(publicDir, "styles.css")),
    cp(
      path.join(root, "mitrinium_logo.png"),
      path.join(publicDir, "mitrinium_logo.png"),
    ),
  ]);

  let landing = await readFile(path.join(publicDir, "index.html"), "utf8");
  landing = landing.replace(
    /https:\/\/script\.google\.com\/macros\/s\/AKfycby0EgJQy0c_L3IiFgwYbRC5HYR8tM_tJ4KM_idGHFW7rIqu1YZhPjCBYuBfDM0NU_Om\/exec/g,
    "/editor/",
  );
  await writeFile(path.join(publicDir, "index.html"), landing, "utf8");
}

await rm(publicDir, { recursive: true, force: true });
await mkdir(publicDir, { recursive: true });
await Promise.all([
  buildLanding(),
  buildEditor(),
  cp(path.join(root, "src", "client", "admin"), adminDir, {
    recursive: true,
  }),
]);

console.log("Built public landing page, /editor and /admin applications.");
