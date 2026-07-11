//src/pages/sales/components/BarcodeComponent.tsx
import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

interface BarcodeComponentProps {
  value: string;
  height?: number;
  width?: number;
  margin?: number;
}

export const BarcodeComponent: React.FC<BarcodeComponentProps> = ({ 
  value, 
  height = 25, 
  width = 1.1, 
  margin = 4 
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format: 'CODE128',
          width: width,
          height: height,
          displayValue: false, 
          margin: margin,
          background: '#ffffff',
          lineColor: '#000000',
        });
      } catch (err) {
        console.error('Barcode rendering error:', err);
      }
    }
  }, [value, height, width, margin]);

  return <svg ref={svgRef} className="mx-auto" />;
};