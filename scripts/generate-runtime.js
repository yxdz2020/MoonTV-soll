#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 读取 config.json 文件
const configPath = path.join(process.cwd(), 'config.json');
const outputPath = path.join(process.cwd(), 'src/lib/runtime.ts');

try {
  const configContent = fs.readFileSync(configPath, 'utf-8');
  const config = JSON.parse(configContent);

  // 生成 TypeScript 代码
  const tsContent = `// 该文件由 scripts/generate-runtime.js 自动生成，请勿手动修改
/* eslint-disable */

export default ${JSON.stringify(config, null, 2)};
`;

  // 写入文件
  fs.writeFileSync(outputPath, tsContent, 'utf-8');
  console.log('✅ runtime.ts 文件生成成功');
} catch (error) {
  console.error('❌ 生成 runtime.ts 文件失败:', error.message);
  process.exit(1);
}
