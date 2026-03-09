const fs = require('fs');
const path = require('path');
const { minify } = require('terser');
const { minify: minifyHTML } = require('html-minifier-terser');
const CleanCSS = require('clean-css');

const distDir = path.join(__dirname, 'dist');

// 清理并创建 dist 目录
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });
fs.mkdirSync(path.join(distDir, 'src'), { recursive: true });
fs.mkdirSync(path.join(distDir, 'public', 'js'), { recursive: true });
fs.mkdirSync(path.join(distDir, 'public', 'css'), { recursive: true });
fs.mkdirSync(path.join(distDir, 'data'), { recursive: true });
fs.mkdirSync(path.join(distDir, 'logs'), { recursive: true });

console.log('开始打包...\n');

(async () => {
  await compressBackend();
  await compressFrontend();
  copyOtherFiles();

  console.log('\n✓ 打包完成！输出目录: dist/');
  console.log('\n部署说明:');
  console.log('1. cd dist');
  console.log('2. npm install --production');
  console.log('3. npm start');
})();

async function compressBackend() {
  console.log('→ 压缩混淆后端代码...');

  const terserOptions = {
    compress: {
      dead_code: true,
      drop_console: false,
      drop_debugger: true,
      passes: 3,
      pure_funcs: ['console.log', 'console.debug']
    },
    mangle: {
      toplevel: true,
      properties: {
        regex: /^_/
      }
    },
    format: {
      comments: false
    }
  };

  // 压缩 src 目录下所有 JS 文件
  const srcFiles = fs.readdirSync('src').filter(f => f.endsWith('.js'));
  for (const file of srcFiles) {
    const code = fs.readFileSync(`src/${file}`, 'utf8');
    const result = await minify(code, terserOptions);
    fs.writeFileSync(path.join(distDir, 'src', file), result.code);
    console.log(`  ✓ src/${file}`);
  }

  // 压缩 server.js
  const serverCode = fs.readFileSync('server.js', 'utf8');
  const serverResult = await minify(serverCode, terserOptions);
  fs.writeFileSync(path.join(distDir, 'server.js'), serverResult.code);
  console.log('  ✓ server.js');
}

async function compressFrontend() {
  console.log('→ 压缩混淆前端文件...');

  const terserOptions = {
    compress: {
      dead_code: true,
      drop_console: true,
      drop_debugger: true,
      passes: 3,
      unsafe: true,
      unsafe_comps: true,
      unsafe_math: true
    },
    mangle: {
      toplevel: true,
      properties: {
        regex: /^_/
      }
    },
    format: {
      comments: false
    }
  };

  // 压缩 JS
  const jsFiles = ['client.js', 'admin.js'];
  for (const file of jsFiles) {
    const code = fs.readFileSync(`public/js/${file}`, 'utf8');
    const result = await minify(code, terserOptions);
    fs.writeFileSync(path.join(distDir, 'public', 'js', file), result.code);
    console.log(`  ✓ js/${file}`);
  }

  // 压缩 CSS
  const cssFiles = fs.readdirSync('public/css');
  const cleanCSS = new CleanCSS({ level: 2 });
  for (const file of cssFiles) {
    const code = fs.readFileSync(`public/css/${file}`, 'utf8');
    const result = cleanCSS.minify(code);
    fs.writeFileSync(path.join(distDir, 'public', 'css', file), result.styles);
    console.log(`  ✓ css/${file}`);
  }

  // 压缩 HTML
  const htmlFiles = ['index.html', 'admin.html'];
  for (const file of htmlFiles) {
    const code = fs.readFileSync(`public/${file}`, 'utf8');
    const result = await minifyHTML(code, {
      collapseWhitespace: true,
      removeComments: true,
      minifyJS: true,
      minifyCSS: true
    });
    fs.writeFileSync(path.join(distDir, 'public', file), result);
    console.log(`  ✓ ${file}`);
  }
}

function copyOtherFiles() {
  console.log('→ 复制配置文件...');

  // 简化 package.json
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  delete pkg.devDependencies;
  delete pkg.scripts.build;
  delete pkg.scripts.clean;
  fs.writeFileSync(path.join(distDir, 'package.json'), JSON.stringify(pkg, null, 2));
  console.log('  ✓ package.json');

  // 复制其他文件
  const files = ['package-lock.json', 'README.md', '.gitignore'];
  files.forEach(file => {
    if (fs.existsSync(file)) {
      fs.copyFileSync(file, path.join(distDir, file));
      console.log(`  ✓ ${file}`);
    }
  });
}
