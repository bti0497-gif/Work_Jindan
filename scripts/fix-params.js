const fs = require('fs');
const path = require('path');

// API 라우트 디렉토리 경로
const apiDir = path.join(__dirname, '..', 'src', 'app', 'api');

// 재귀적으로 route.ts 파일 찾기
function findRouteFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      files.push(...findRouteFiles(fullPath));
    } else if (item === 'route.ts') {
      files.push(fullPath);
    }
  }
  
  return files;
}

// params 타입을 Promise로 변경
function fixParamsType(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // { params }: { params: { id: string } } -> { params }: { params: Promise<{ id: string }> }
  const oldPattern = /\{\s*params\s*\}:\s*\{\s*params:\s*\{\s*id:\s*string\s*\}\s*\}/g;
  if (oldPattern.test(content)) {
    content = content.replace(oldPattern, '{ params }: { params: Promise<{ id: string }> }');
    modified = true;
  }
  
  // params.id 사용을 await params로 변경
  // const { id } = await params; 형태로 변경
  const paramsIdPattern = /params\.id/g;
  if (paramsIdPattern.test(content)) {
    // 먼저 const { id } = await params; 가 없는 경우 추가
    const funcPattern = /(export\s+async\s+function\s+(?:GET|POST|PUT|DELETE|PATCH)\s*\([^)]*\{\s*params\s*\}:\s*\{\s*params:\s*Promise<[^>]+>\s*\}[^)]*\)\s*\{[^{]*\{)/g;
    
    // params.id를 id로 변경
    content = content.replace(paramsIdPattern, 'id');
    
    // 함수 시작 부분에 const { id } = await params; 추가
    content = content.replace(funcPattern, (match) => {
      if (!match.includes('await params')) {
        return match.replace(/{$/, '{\n    const { id } = await params;\n');
      }
      return match;
    });
    
    modified = true;
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed: ${filePath}`);
  }
}

// 모든 route.ts 파일 찾아서 수정
const routeFiles = findRouteFiles(apiDir);
console.log(`Found ${routeFiles.length} route files`);

for (const file of routeFiles) {
  try {
    fixParamsType(file);
  } catch (error) {
    console.error(`Error processing ${file}:`, error.message);
  }
}

console.log('Done!');
