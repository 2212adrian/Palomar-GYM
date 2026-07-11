//src/pages/sales/utils/barcodePdfHelper.ts
import JsBarcode from 'jsbarcode';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { saveAs } from 'file-saver';

export type LabelTemplateType = 
  | '32_labels' 
  | '40_labels' 
  | '24_labels' 
  | '65_labels' 
  | '30_labels' 
  | '21_labels' 
  | '14_labels' 
  | '80_labels';

export interface LabelTemplate {
  id: LabelTemplateType;
  name: string;
  labelsPerPage: number;
  cols: number;
  rows: number;
  labelWidth: number;  // in mm
  labelHeight: number; // in mm
  marginTop: number;   // in mm
  marginLeft: number;  // in mm
  gapHorizontal: number; // in mm
  gapVertical: number;   // in mm
}

export interface BarcodeSettingsState {
  templateId: LabelTemplateType;
  copies: number;
  showProductName: boolean;
  showPrice: boolean;
  showBarcodeText: boolean;
  barcodeWidth: number;
  barcodeHeight: number;
  fontSize: number;
  margin: number;
  gapBetweenLabels: number;
  zoom: number;
}

export interface PrintableItem {
  id: string;
  barcode_id: string;
  product_name: string;
  selling_price: number;
  copiesToPrint?: number;
}

export const MM_TO_POINTS = 2.83465;

// Hardcoded standard Letter paper dimension coordinates: 8.5" x 11" (215.9mm x 279.4mm)
export const LETTER_PAPER = { width: 220.9, height: 279.4, name: 'Letter (8.5" x 11")' };

export const LABEL_TEMPLATES: Record<LabelTemplateType, LabelTemplate> = {
  '32_labels': {
    id: '32_labels',
    name: '32 Labels (4 x 8 Grid)',
    labelsPerPage: 32,
    cols: 4,
    rows: 8,
    labelWidth: 48.5,
    labelHeight: 32.0,
    marginTop: 15,
    marginLeft: 10,
    gapHorizontal: 3.0,
    gapVertical: 2.0,
  },
  '40_labels': {
    id: '40_labels',
    name: '40 Labels (4 x 10 Grid)',
    labelsPerPage: 40,
    cols: 4,
    rows: 10,
    labelWidth: 48.5,
    labelHeight: 25.4,
    marginTop: 11.5,
    marginLeft: 10,
    gapHorizontal: 3.0,
    gapVertical: 0,
  },
  '24_labels': {
    id: '24_labels',
    name: '24 Labels (3 x 8 Grid)',
    labelsPerPage: 24,
    cols: 3,
    rows: 8,
    labelWidth: 63.5,
    labelHeight: 33.9,
    marginTop: 12.5,
    marginLeft: 10,
    gapHorizontal: 4.0,
    gapVertical: 0,
  },
  '65_labels': {
    id: '65_labels',
    name: '65 Labels (5 x 13 Grid)',
    labelsPerPage: 65,
    cols: 5,
    rows: 13,
    labelWidth: 38.1,
    labelHeight: 21.2,
    marginTop: 10,
    marginLeft: 10,
    gapHorizontal: 2.5,
    gapVertical: 0,
  },
  '30_labels': {
    id: '30_labels',
    name: '30 Labels (3 x 10 Grid)',
    labelsPerPage: 30,
    cols: 3,
    rows: 10,
    labelWidth: 66.7,
    labelHeight: 25.4,
    marginTop: 12.7,
    marginLeft: 4.6,
    gapHorizontal: 3.1,
    gapVertical: 0,
  },
  '21_labels': {
    id: '21_labels',
    name: '21 Labels (3 x 7 Grid)',
    labelsPerPage: 21,
    cols: 3,
    rows: 7,
    labelWidth: 63.5,
    labelHeight: 38.1,
    marginTop: 12.7,
    marginLeft: 10.0,
    gapHorizontal: 4.0,
    gapVertical: 0,
  },
  '14_labels': {
    id: '14_labels',
    name: '14 Labels (2 x 7 Grid)',
    labelsPerPage: 14,
    cols: 2,
    rows: 7,
    labelWidth: 101.6,
    labelHeight: 33.8,
    marginTop: 21.0,
    marginLeft: 4.0,
    gapHorizontal: 4.7,
    gapVertical: 0,
  },
  '80_labels': {
    id: '80_labels',
    name: '80 Labels (4 x 16 Grid)',
    labelsPerPage: 80,
    cols: 4,
    rows: 16,
    labelWidth: 44.4,
    labelHeight: 14.7,
    marginTop: 12.7,
    marginLeft: 7.6,
    gapHorizontal: 2.5,
    gapVertical: 0,
  },
};

// Decodes dataURI base64 formats safely into clean binary arrays to prevent document compile issues
export const base64ToUint8Array = (base64Str: string): Uint8Array => {
  const base64Data = base64Str.includes(',') ? base64Str.split(',')[1] : base64Str;
  const binaryString = window.atob(base64Data.trim());
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

export const generateBarcodeDataUrl = (value: string, options: { width: number; height: number; margin: number }): string => {
  const canvas = document.createElement('canvas');
  try {
    JsBarcode(canvas, value, {
      format: 'CODE128',
      width: options.width,
      height: options.height,
      displayValue: false,
      margin: options.margin,
      background: '#ffffff',
      lineColor: '#000000',
    });
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.error('Barcode rendering error:', err);
    return '';
  }
};

export const generatePdfFile = async (
  items: PrintableItem[],
  settings: BarcodeSettingsState
): Promise<void> => {
  const doc = await PDFDocument.create();
  const template = LABEL_TEMPLATES[settings.templateId];

  const pageWidth = LETTER_PAPER.width * MM_TO_POINTS;
  const pageHeight = LETTER_PAPER.height * MM_TO_POINTS;

  const labelsToPrint: PrintableItem[] = [];
  items.forEach(item => {
    const totalCopies = item.copiesToPrint ?? settings.copies;
    for (let i = 0; i < totalCopies; i++) {
      labelsToPrint.push(item);
    }
  });

  if (labelsToPrint.length === 0) return;

  const labelsPerPage = template.labelsPerPage;
  const totalPages = Math.ceil(labelsToPrint.length / labelsPerPage);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);

  // Proportional font sizing based on label template height
  const isSmallLabel = template.labelHeight < 22; 
  const productNameSize = isSmallLabel ? 6.5 : 8.5;
  const barcodeTextSize = isSmallLabel ? 6.0 : 7.5;
  const priceTextSize = isSmallLabel ? 7.5 : 9.5;

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const page = doc.addPage([pageWidth, pageHeight]);
    const startIndex = pageIdx * labelsPerPage;
    const pageLabels = labelsToPrint.slice(startIndex, startIndex + labelsPerPage);

    for (let i = 0; i < pageLabels.length; i++) {
      const labelItem = pageLabels[i];
      const col = i % template.cols;
      const row = Math.floor(i / template.cols);

      const xMm = template.marginLeft + col * (template.labelWidth + template.gapHorizontal);
      const yMm = template.marginTop + row * (template.labelHeight + template.gapVertical);

      const x = xMm * MM_TO_POINTS;
      const y = pageHeight - (yMm + template.labelHeight) * MM_TO_POINTS;
      const width = template.labelWidth * MM_TO_POINTS;
      const height = template.labelHeight * MM_TO_POINTS;

      // Draw dotted outline boundary guide
      page.drawRectangle({
        x,
        y,
        width,
        height,
        borderColor: rgb(0.4, 0.45, 0.5), 
        borderWidth: 0.5,
        borderDashArray: [2, 2],
      });

      // 1. CALCULATE BOTTOM TEXT ZONE BOUNDS (Price & Barcode Text)
      let yPaddingBottom = isSmallLabel ? 1.5 : 3.0;
      let yPrice = y + yPaddingBottom;
      
      if (settings.showPrice) {
        yPaddingBottom += priceTextSize + (isSmallLabel ? 1.0 : 2.0);
      }
      
      let yBarcodeText = y + yPaddingBottom;
      
      if (settings.showBarcodeText) {
        yPaddingBottom += barcodeTextSize + (isSmallLabel ? 1.0 : 2.0);
      }
      
      const barcodeMinY = y + yPaddingBottom; // Bottom bounds limit for the barcode image

      // 2. CALCULATE TOP TEXT ZONE BOUNDS (Product Name)
      let yPaddingTop = isSmallLabel ? 1.5 : 3.0;
      let yProductName = y + height - yPaddingTop - productNameSize;
      
      if (settings.showProductName) {
        yPaddingTop += productNameSize + (isSmallLabel ? 1.0 : 2.0);
      }
      
      const barcodeMaxY = y + height - yPaddingTop; // Top bounds limit for the barcode image

      // 3. RENDER THE BARCODE IMAGE CENTRED WITHIN THE REMAINING MIDDLE SPACE
      const availableHeight = barcodeMaxY - barcodeMinY;
      const barcodeDataUrl = generateBarcodeDataUrl(labelItem.barcode_id, {
        width: settings.barcodeWidth,
        height: settings.barcodeHeight,
        margin: settings.margin,
      });

      if (barcodeDataUrl && availableHeight > 5) {
        const response = await fetch(barcodeDataUrl);
        const imageBytes = await response.arrayBuffer();
        const image = await doc.embedPng(imageBytes);
        
        // Scale the barcode image to occupy up to 60% of the middle zone height
        const maxImgHeight = Math.min(availableHeight, height * 0.60);
        const imgHeight = Math.max(isSmallLabel ? 6 : 10, maxImgHeight);
        
        const imgWidth = width * 0.90;
        const imgX = x + (width - imgWidth) / 2;
        const imgY = barcodeMinY + (availableHeight - imgHeight) / 2;

        page.drawImage(image, {
          x: imgX,
          y: imgY,
          width: imgWidth,
          height: imgHeight,
        });
      }

      // 4. DRAW TEXTS
      if (settings.showProductName) {
        const truncatedName =
          labelItem.product_name.length > (isSmallLabel ? 20 : 25)
            ? labelItem.product_name.substring(0, isSmallLabel ? 17 : 22) + '...'
            : labelItem.product_name;

        const textWidth = font.widthOfTextAtSize(truncatedName, productNameSize);
        page.drawText(truncatedName, {
          x: x + (width - textWidth) / 2,
          y: yProductName,
          size: productNameSize,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
      }

      if (settings.showBarcodeText) {
        const codeText = labelItem.barcode_id;
        const textWidth = font.widthOfTextAtSize(codeText, barcodeTextSize);
        page.drawText(codeText, {
          x: x + (width - textWidth) / 2,
          y: yBarcodeText,
          size: barcodeTextSize,
          font,
          color: rgb(0.3, 0.3, 0.3),
        });
      }

      if (settings.showPrice) {
        const priceText = `Php ${Number(labelItem.selling_price).toFixed(2)}`;
        const textWidth = font.widthOfTextAtSize(priceText, priceTextSize);
        page.drawText(priceText, {
          x: x + (width - textWidth) / 2,
          y: yPrice,
          size: priceTextSize,
          font,
          color: rgb(0.05, 0.05, 0.05),
        });
      }
    }
  }

  const pdfBytes = await doc.save();
  const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
  const datestamp = new Date().toISOString().split('T')[0];
  saveAs(blob, `barcodes_${datestamp}.pdf`);
};

export const triggerBrowserPrint = (printableElementId: string): void => {
  const content = document.getElementById(printableElementId);
  if (!content) return;

  const printFrame = document.createElement('iframe');
  printFrame.style.position = 'fixed';
  printFrame.style.right = '0';
  printFrame.style.bottom = '0';
  printFrame.style.width = '0';
  printFrame.style.height = '0';
  printFrame.style.border = '0';

  document.body.appendChild(printFrame);

  const doc = printFrame.contentWindow?.document;
  if (!doc) return;

  let stylesHtml = '';
  document.querySelectorAll('style, link[rel="stylesheet"]').forEach(el => {
    stylesHtml += el.outerHTML;
  });

  doc.write(`
    <html>
      <head>
        <title>Barcode Print Sheets</title>
        ${stylesHtml}
        <style>
          @media print {
            body {
              margin: 0 !important;
              padding: 0 !important;
              background-color: #ffffff !important;
              color: #000000 !important;
            }
            .print-page-sheet {
              page-break-after: always !important;
              box-shadow: none !important;
              border: none !important;
              margin: 0 !important;
              background: #ffffff !important;
            }
            /* Exclude last page from triggering trailing blank sheets */
            .print-page-sheet:not(:last-child) {
              page-break-after: always !important;
            }
            .print-label-item {
              border: 1px dashed #64748b !important;
            }
          }
        </style>
      </head>
      <body>
        <div>${content.innerHTML}</div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              setTimeout(function() {
                window.frameElement.remove();
              }, 500);
            }, 500);
          };
        </script>
      </body>
    </html>
  `);
  doc.close();
};