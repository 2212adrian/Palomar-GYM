
// src/pages/sales/components/BarcodeComponent.tsx
import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

interface BarcodeComponentProps {
  value: string;
  width?: number;
  height?: number;
  margin?: number;
  fontSize?: number;
  displayValue?: boolean;
  className?: string;
}

export const BarcodeComponent: React.FC<BarcodeComponentProps> = ({
  value,
  width = 2,           // Strict integer module width (min 2px)
  height = 45,          // Clear laser/camera scan height
  margin = 10,          // 10X quiet zone (ISO/IEC 15417)
  fontSize = 12,
  displayValue = false,
  className = '',
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;

    try {
      JsBarcode(svgRef.current, value, {
        format: 'CODE128',
        width: Math.max(1, Math.round(width)), // Enforce integer module scaling
        height,
        displayValue,
        fontSize,
        margin,
        background: '#ffffff',
        lineColor: '#000000',
        valid: () => {},
      });
    } catch (err) {
      console.error('Failed to render barcode:', err);
    }
  }, [value, width, height, margin, fontSize, displayValue]);

  if (!value) return null;

  return (
    <svg 
      ref={svgRef} 
      className={`block max-w-full h-auto select-none ${className}`}
      style={{ shapeRendering: 'crispEdges' }}
    />
  );
};
