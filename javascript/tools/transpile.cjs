const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '../..');
const javascriptRoot = path.resolve(__dirname, '..');
const ts = require(require.resolve('typescript', { paths: [repositoryRoot] }));

function transpileTree(sourceDirectory, outputDirectory, options, extensionForTsx = '.js') {
  for (const entry of fs.readdirSync(sourceDirectory, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDirectory, entry.name);
    if (entry.isDirectory()) {
      transpileTree(sourcePath, path.join(outputDirectory, entry.name), options, extensionForTsx);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith('.d.ts')) continue;

    const source = fs.readFileSync(sourcePath, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: options,
      fileName: sourcePath,
      reportDiagnostics: true,
    });
    const errors = (output.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    if (errors.length) {
      const details = errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('\n');
      throw new Error(`Failed to transpile ${sourcePath}:\n${details}`);
    }

    const extension = entry.name.endsWith('.tsx') ? extensionForTsx : '.js';
    const outputPath = path.join(outputDirectory, entry.name.replace(/\.tsx?$/, extension));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, output.outputText);
  }
}

function copy(source, target) {
  fs.cpSync(source, target, { recursive: true, force: true });
}

const backendOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  esModuleInterop: true,
  experimentalDecorators: true,
  emitDecoratorMetadata: true,
};
const frontendOptions = {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.ReactJSX,
  esModuleInterop: true,
};

const backendSource = path.join(repositoryRoot, 'backend', 'src');
const frontendSource = path.join(repositoryRoot, 'frontend', 'src');
const backendOutput = path.join(javascriptRoot, 'backend', 'src');
const frontendOutput = path.join(javascriptRoot, 'frontend', 'src');

fs.rmSync(backendOutput, { recursive: true, force: true });
fs.rmSync(frontendOutput, { recursive: true, force: true });
transpileTree(backendSource, backendOutput, backendOptions);
transpileTree(frontendSource, frontendOutput, frontendOptions, '.jsx');

const viteConfig = path.join(repositoryRoot, 'frontend', 'vite.config.ts');
const viteOutput = ts.transpileModule(fs.readFileSync(viteConfig, 'utf8'), {
  compilerOptions: frontendOptions,
  fileName: viteConfig,
}).outputText;
fs.writeFileSync(path.join(javascriptRoot, 'frontend', 'vite.config.js'), viteOutput);

copy(path.join(repositoryRoot, 'frontend', 'index.html'), path.join(javascriptRoot, 'frontend', 'index.html'));
copy(path.join(repositoryRoot, 'frontend', 'src', 'index.css'), path.join(frontendOutput, 'index.css'));
copy(path.join(repositoryRoot, 'frontend', 'tailwind.config.js'), path.join(javascriptRoot, 'frontend', 'tailwind.config.js'));
copy(path.join(repositoryRoot, 'frontend', 'postcss.config.js'), path.join(javascriptRoot, 'frontend', 'postcss.config.js'));
copy(path.join(repositoryRoot, 'frontend', 'vercel.json'), path.join(javascriptRoot, 'frontend', 'vercel.json'));
copy(path.join(repositoryRoot, 'frontend', '.env.example'), path.join(javascriptRoot, 'frontend', '.env.example'));
copy(path.join(repositoryRoot, 'backend', '.env.example'), path.join(javascriptRoot, 'backend', '.env.example'));
copy(path.join(repositoryRoot, 'backend', 'database'), path.join(javascriptRoot, 'backend', 'database'));
copy(path.join(repositoryRoot, 'backend', 'prisma'), path.join(javascriptRoot, 'backend', 'prisma'));

const htmlPath = path.join(javascriptRoot, 'frontend', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8').replace('/src/main.tsx', '/src/main.jsx');
fs.writeFileSync(htmlPath, html);

console.log('JavaScript source mirror generated under javascript/.');
