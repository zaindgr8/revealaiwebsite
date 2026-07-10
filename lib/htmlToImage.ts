'use client';

/**
 * htmlToImage.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Custom DOM-to-PNG renderer using SVG foreignObject serialization.
 * Zero external dependencies. Copies computed styles recursively to the cloned node
 * to ensure that CSS styles, layout, and typography render perfectly in the PNG.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export async function domToPng(
  element: HTMLElement,
  width: number,
  height: number
): Promise<string> {
  const clone = element.cloneNode(true) as HTMLElement;

  // Recursively copy computed styles from original element to clone
  function copyStyles(src: HTMLElement, dest: HTMLElement) {
    const computed = window.getComputedStyle(src);
    for (const key of Array.from(computed)) {
      // Avoid copying write-only or empty properties that throw warnings
      if (key && !key.startsWith('-webkit-inline')) {
        try {
          dest.style.setProperty(
            key,
            computed.getPropertyValue(key),
            computed.getPropertyPriority(key)
          );
        } catch {}
      }
    }
    // Recurse children
    for (let i = 0; i < src.children.length; i++) {
      copyStyles(src.children[i] as HTMLElement, dest.children[i] as HTMLElement);
    }
  }

  // Inject styles to destination clone
  copyStyles(element, clone);

  // Format element for XML serialization
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  clone.style.position = 'relative';
  clone.style.top = '0';
  clone.style.left = '0';
  clone.style.margin = '0';
  clone.style.boxSizing = 'border-box';
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;

  // Serialize to clean XHTML string
  const serializer = new XMLSerializer();
  const xhtml = serializer.serializeToString(clone);

  // Wrap in valid SVG container
  const svgString = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <foreignObject width="100%" height="100%">
        ${xhtml}
      </foreignObject>
    </svg>
  `;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    img.crossOrigin = 'anonymous';
    img.src = url;

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }
      // Paint to canvas and get PNG
      ctx.drawImage(img, 0, 0);
      try {
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load serialized SVG into Image'));
    };
  });
}
