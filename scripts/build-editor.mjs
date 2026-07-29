import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "apps-script-source");
const calculatorSourceDir = path.join(root, "calculator-script-source");
const publicDir = path.join(root, "public");
const editorDir = path.join(publicDir, "editor");
const calculatorDir = path.join(publicDir, "calculator");
const adminDir = path.join(publicDir, "admin");
const loginDir = path.join(publicDir, "login");

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
      "</nav>",
      `      <button
        type="button"
        id="dashboardButton"
        class="dashboard-button"
        onclick="location.href='/admin/'"
        hidden
      >
        Dashboard
      </button>

      <button
        type="button"
        id="logoutButton"
        class="logout-button"
        onclick="mitriniumLogout()"
      >
        Выйти
      </button>
    </nav>`,
    )
    .replace(
      "</head>",
      `  <style>
    .mode-switcher .logout-button {
      border-color: #8f4a43;
      color: #ffe2dd;
      background: #46241f;
    }
    .mode-switcher .dashboard-button {
      border-color: #8f7434;
      color: #fff0c8;
      background: #443719;
    }
    .mode-switcher .dashboard-button[hidden] {
      display: none;
    }
    .mode-switcher .dashboard-button:hover {
      background: #58471d;
    }
    .mode-switcher .logout-button:hover {
      background: #5a2b25;
    }
  </style>
  <script src="google-script-run.js"></script>
</head>`,
    );

  await mkdir(editorDir, { recursive: true });
  await writeFile(path.join(editorDir, "index.html"), html, "utf8");
  await cp(
    path.join(root, "src", "client", "google-script-run.js"),
    path.join(editorDir, "google-script-run.js"),
  );
}

async function buildCalculator() {
  let html = await readFile(
    path.join(calculatorSourceDir, "Index.html"),
    "utf8",
  );
  const includes = [...html.matchAll(includePattern)].map(
    (match) => match[1],
  );

  for (const name of includes) {
    const fragment = await readFile(
      path.join(calculatorSourceDir, `${name}.html`),
      "utf8",
    );
    html = html.replace(
      new RegExp(
        `<\\?!=\\s*include\\(['"]${name}['"]\\);\\s*\\?>`,
        "g",
      ),
      fragment,
    );
  }

  html = html
    .replace(
      "<base target=\"_top\">",
      "<base href=\"/calculator/\" target=\"_top\">",
    )
    .replace(
      "</head>",
      `  <script src="google-script-run.js"></script>
</head>`,
    )
    .replace(
      "</nav>",
      `    <button
      type="button"
      class="small"
      onclick="location.href='/'"
    >Сайт</button>
    <button
      type="button"
      class="small"
      onclick="location.href='/editor/'"
    >Редактор</button>
    <button
      type="button"
      id="dashboardButton"
      class="small"
      onclick="location.href='/admin/'"
      hidden
    >Dashboard</button>
    <button
      type="button"
      id="logoutButton"
      class="small"
      onclick="mitriniumLogout()"
    >Выйти</button>
  </nav>`,
    )
    .replace(
      /<a href="https:\/\/script\.google\.com\/macros\/s\/AKfycbzwapvTbhyXmOMwoHRTPZxosuGLzyr-7tflL_anmSgxLxkZi6RM7xgf5SAyxiPJxBna\/exec">Генератор тайлов<\/a>/g,
      `<button
      type="button"
      onclick="location.href='https://script.google.com/macros/s/AKfycbzwapvTbhyXmOMwoHRTPZxosuGLzyr-7tflL_anmSgxLxkZi6RM7xgf5SAyxiPJxBna/exec'"
    >Генератор тайлов</button>`,
    )
    .replace(/Сохранить в Google Таблицу/g, "Сохранить в библиотеку сайта");

  await mkdir(calculatorDir, { recursive: true });
  await writeFile(path.join(calculatorDir, "index.html"), html, "utf8");
  await cp(
    path.join(root, "src", "client", "google-script-run.js"),
    path.join(calculatorDir, "google-script-run.js"),
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
  landing = landing.replace(
    /https:\/\/script\.google\.com\/macros\/s\/AKfycbz-JrcSjmhLW3jr66SOlyqP0QGvkrDAw0zeTWjjuKzalfza4RZ--3XhibAnB95AWPcMsA\/exec/g,
    "/calculator/",
  );
  await writeFile(path.join(publicDir, "index.html"), landing, "utf8");
}

await mkdir(publicDir, { recursive: true });
await Promise.all([
  buildLanding(),
  buildEditor(),
  buildCalculator(),
  cp(path.join(root, "src", "client", "admin"), adminDir, {
    recursive: true,
  }),
  cp(path.join(root, "src", "client", "login"), loginDir, {
    recursive: true,
  }),
]);

console.log(
  "Built public landing page, /editor, /calculator, /admin and /login applications.",
);
