export function downloadText(filename, text, mime = 'application/json') {
  // Android WebView নিজে blob ডাউনলোড সংরক্ষণ করতে পারে না। native অংশ ডাউনলোড-ইভেন্টে এই মান পড়ে
  // "Save as" দেখায়। অন্য সময় এটি দ্রুত মুছে ফেলা হয়।
  const handoff = { filename, text };
  globalThis.__simplechatLastExport = handoff;
  setTimeout(() => {
    if (globalThis.__simplechatLastExport === handoff) globalThis.__simplechatLastExport = null;
  }, 30000);

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
