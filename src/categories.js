export function categoryNames(dishes, remembered = []) {
  const seen = new Set();
  return [...remembered, ...dishes.map(d => d.category)].flatMap(value => {
    const name = String(value ?? '').normalize('NFC').trim();
    const key = name.toLocaleLowerCase('vi');
    if (!name || seen.has(key)) return [];
    seen.add(key);
    return [name];
  });
}
export function canonicalCategory(value, existing) {
  const name = value.normalize('NFC').trim();
  if (!name || [...name].length > 80) throw new Error('Danh mục cần từ 1 đến 80 ký tự.');
  return existing.find(c => c.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi')) ?? name;
}
