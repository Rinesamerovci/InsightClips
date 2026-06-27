const fs = require('fs');
const file = 'backend/app/services/clipping_service.py';
let content = fs.readFileSync(file, 'utf8');
content = content.replace('import re\r\nimport re\r\n', 'import re\r\n');
content = content.replace('import re\nimport re\n', 'import re\n');
fs.writeFileSync(file, content, 'utf8');
