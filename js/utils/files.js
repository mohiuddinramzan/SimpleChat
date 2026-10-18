export function downloadText(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function readFileText(file, maxBytes) {
  if (!file) throw new Error('কোনো ফাইল বাছাই করা হয়নি।');
  if (file.size > maxBytes) throw new Error('ফাইল অনেক বড় (সর্বোচ্চ ১০ MB)।');
  return file.text();
}
