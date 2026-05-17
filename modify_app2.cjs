const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(/slate-300/g, 'yellow-300');
code = code.replace(/divide-slate-100/g, 'divide-yellow-100');
code = code.replace(/slate-200/g, 'yellow-200');
code = code.replace(/slate-900/g, 'yellow-900');
code = code.replace(/bg-indigo-100/g, 'bg-red-100');

fs.writeFileSync('src/App.tsx', code);
console.log('App.tsx updated again.');
