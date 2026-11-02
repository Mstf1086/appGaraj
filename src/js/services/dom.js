export function el(tag, attributes = {}, children = []) {
  const element = document.createElement(tag);
  for (const [key, val] of Object.entries(attributes)) {
    if (key === 'className') {
      element.className = val;
    } else if (key === 'dataset') {
      for (const [dKey, dVal] of Object.entries(val)) {
        element.dataset[dKey] = dVal;
      }
    } else if (key.startsWith('on') && typeof val === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (val === false || val === null || val === undefined) {
      // Boolean false (selected:false, disabled:false vb.) attribute olarak
      // yazılmamalı — setAttribute('selected', false) bile seçili sayılır.
      continue;
    } else if (val === true) {
      element.setAttribute(key, '');
      // selected/disabled/checked/required gibi özelliklerde property'yi de eşitle
      try { if (key in element) element[key] = true; } catch (err) { /* yoksay */ }
    } else if (key === 'value' && 'value' in element) {
      element.value = val;
    } else {
      element.setAttribute(key, val);
    }
  }
  for (const child of children) {
    if (child == null) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      element.appendChild(document.createTextNode(String(child)));
    } else if (child instanceof Node) {
      element.appendChild(child);
    }
  }
  return element;
}

export function clearElement(element) {
  element.replaceChildren();
}
