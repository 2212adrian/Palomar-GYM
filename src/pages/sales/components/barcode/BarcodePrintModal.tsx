import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { 
  BarcodeSettingsState, PrintableItem, LabelTemplateType
} from '../../utils/barcodePdfHelper';
import { 
  LABEL_TEMPLATES, LETTER_PAPER, generatePdfFile, triggerBrowserPrint 
} from '../../utils/barcodePdfHelper';
import { BarcodeComponent } from '../BarcodeComponent';
import { 
  X, Printer, Download, Search, CheckSquare, Square, Sliders, ToggleLeft, ToggleRight, 
  ZoomIn, ZoomOut, Maximize2, Settings, Loader2, ChevronDown, ChevronUp 
} from 'lucide-react';
import { toast } from 'react-toastify';
import { saveAs } from 'file-saver';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

interface BarcodePrintModalProps {
  products: PrintableItem[];
  initialSelectedIds?: string[];
  onClose: () => void;
}

const DEFAULT_SETTINGS: BarcodeSettingsState = {
  templateId: '32_labels',
  copies: 1,
  showProductName: true,
  showPrice: true,
  showBarcodeText: true,
  barcodeWidth: 1.35, 
  barcodeHeight: 35,  
  fontSize: 10,
  margin: 3,
  gapBetweenLabels: 2,
  zoom: 100,
};

// Converts Uint8Array or ArrayBuffer to Base64
const arrayBufferToBase64 = (buffer: ArrayBuffer | Uint8Array): string => {
  let binary = '';
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

export const BarcodePrintModal: React.FC<BarcodePrintModalProps> = ({
  products,
  initialSelectedIds = [],
  onClose,
}) => {
  const [settings, setSettings] = useState<BarcodeSettingsState>(DEFAULT_SETTINGS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);
  const [generating, setGenerating] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<'configure' | 'preview'>('configure');

  // Toggle portal body class to hide the bottom navbar across the application while active
  useEffect(() => {
    document.body.classList.add('print-portal-open');
    return () => {
      document.body.classList.remove('print-portal-open');
    };
  }, []);

  // Accordion Expand States: Both default strictly to collapsed (false) on all viewports
  const [isLayoutPresetOpen, setIsLayoutPresetOpen] = useState(false);
  const [isDisplayParamsOpen, setIsDisplayParamsOpen] = useState(false);

  const filteredProducts = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return products.filter(p => 
      query === '' || p.product_name.toLowerCase().includes(query) || p.barcode_id.toLowerCase().includes(query)
    );
  }, [products, searchQuery]);

  const printableItemsList = useMemo(() => {
    return products.filter(p => selectedIds.includes(p.id));
  }, [products, selectedIds]);

  const expandedItemsList = useMemo(() => {
    const list: PrintableItem[] = [];
    printableItemsList.forEach(item => {
      const copies = item.copiesToPrint ?? settings.copies;
      for (let i = 0; i < copies; i++) {
        list.push(item);
      }
    });
    return list;
  }, [printableItemsList, settings.copies]);

  const template = LABEL_TEMPLATES[settings.templateId];
  const totalPagesRequired = Math.ceil(expandedItemsList.length / template.labelsPerPage) || 1;

  // Proportional layout calculations
  const isSmallLabel = template.labelHeight < 22;

  // Convert label height in mm directly to on-screen pixels for the preview
  const labelHeightPx = template.labelHeight * 3.78;

  // Calculate dynamic space for barcode bars
  const nameSpacing = settings.showProductName ? 16 : 0;
  const bottomSpacing = (settings.showBarcodeText ? 12 : 0) + (settings.showPrice ? 14 : 0);
  const availableSvgHeight = labelHeightPx - nameSpacing - bottomSpacing - 12;

  const targetHeight = Math.min(availableSvgHeight, labelHeightPx * 0.50);
  const svgHeight = Math.max(10, Math.floor(targetHeight));
  const svgMargin = isSmallLabel ? 2 : 3;

  // Zoom factor scaling
  const zoomFactor = settings.zoom / 100;
  const scaledWidthMm = LETTER_PAPER.width * zoomFactor;
  const scaledHeightMm = (LETTER_PAPER.height * totalPagesRequired) * zoomFactor + (24 * totalPagesRequired * zoomFactor);

  // PDF DOWNLOAD HANDLER (Capacitor Mobile Save/Share vs Web Browser saveAs)
  const handleDownload = async () => {
    if (printableItemsList.length === 0) {
      toast.error('Please select at least one item to print.');
      return;
    }

    try {
      setGenerating(true);
      toast.info('Generating high-resolution barcode PDF...');
      
      const pdfBytes = await generatePdfFile(printableItemsList, settings);
      const fileName = `Store_Barcode_Labels_${new Date().toISOString().split('T')[0]}.pdf`;

      if (Capacitor.isNativePlatform()) {
        const base64Data = arrayBufferToBase64(pdfBytes);
        const file = await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Cache,
          recursive: true,
        });

        await Share.share({
          title: 'Store Barcode Labels PDF',
          text: 'Save or share official store barcode labels PDF',
          files: [file.uri],
          dialogTitle: 'Save / Share Barcode PDF',
        });
        toast.success('Barcode labels PDF ready for sharing/saving!');
        return;
      }

      // Web Browser download
      const pdfBlob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      try {
        saveAs(pdfBlob, fileName);
        toast.success('Barcode PDF downloaded successfully!');
      } catch (saveErr) {
        console.warn('saveAs fallback triggered:', saveErr);
        const link = document.createElement('a');
        link.href = URL.createObjectURL(pdfBlob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        toast.success('Barcode PDF downloaded successfully!');
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('PDF Generation error:', err);
        toast.error('Could not compile PDF document.');
      }
    } finally {
      setGenerating(false);
    }
  };

  // PRINT HANDLER (Capacitor Native Mobile Share/Print vs Web Browser iFrame Print)
  const handlePrint = async () => {
    if (printableItemsList.length === 0) {
      toast.error('Please select at least one item to print.');
      return;
    }

    if (Capacitor.isNativePlatform()) {
      try {
        setGenerating(true);
        toast.info('Preparing printable barcode labels...');
        const pdfBytes = await generatePdfFile(printableItemsList, settings);
        const fileName = `Print_Barcode_Labels_${new Date().toISOString().split('T')[0]}.pdf`;
        const base64Data = arrayBufferToBase64(pdfBytes);

        const file = await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Cache,
          recursive: true,
        });

        await Share.share({
          title: 'Print Store Barcode Labels',
          text: 'Select your printer or print service to print store barcode labels.',
          files: [file.uri],
          dialogTitle: 'Print Barcode Labels',
        });
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.error('Native print share error:', err);
          toast.error('Could not open print sheet on mobile device.');
        }
      } finally {
        setGenerating(false);
      }
      return;
    }

    // Web Browser Desktop Print
    triggerBrowserPrint('barcode-printable-area');
  };

  return createPortal(
    <div className="fixed inset-0 z-[16000] bg-[var(--bg-page)] flex flex-col font-body text-[var(--color-text)] select-none animate-fade-in">
      
      {/* Header Bar */}
      <div className="px-6 py-4 border-b border-(--border-color) bg-[var(--bg-card)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-500/10 rounded-xl text-blue-500 border border-blue-500/20">
            <Printer className="w-5 h-5 animate-pulse" />
          </div>
          <div className="text-left">
            <h2 className="text-sm font-heading tracking-widest uppercase text-[var(--color-text)]">PRINT STORE LABELS</h2>
            <p className="text-[10px] text-slate-400 font-bold block mt-0.5">
              Select catalog items, customize sizing sheets, and download vectors.
            </p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-1.5 bg-slate-100/5 hover:bg-slate-100/10 text-slate-400 hover:text-white rounded-xl transition-all cursor-pointer border border-(--border-color)"
          title="Close print portal"
          aria-label="Close print portal"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Tab Switchers on Mobile */}
      <div className="flex md:hidden bg-slate-900/50 p-1 rounded-xl border border-white/5 mx-6 mt-4 shrink-0">
        <button
          type="button"
          onClick={() => setActiveMobileTab('configure')}
          className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider text-center rounded-lg cursor-pointer ${
            activeMobileTab === 'configure' ? 'bg-blue-500 text-white shadow-md' : 'text-slate-400'
          }`}
        >
          Configure
        </button>
        <button
          type="button"
          onClick={() => setActiveMobileTab('preview')}
          className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider text-center rounded-lg cursor-pointer ${
            activeMobileTab === 'preview' ? 'bg-blue-500 text-white shadow-md' : 'text-slate-400'
          }`}
        >
          Layout Preview
        </button>
      </div>

      {/* Main Grid Workspace */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden mt-2 md:mt-0">
        
        {/* LEFT CONTROL SIDEBAR PANEL */}
        <div className={`lg:col-span-4 border-r border-(--border-color) bg-[var(--bg-card)] p-6 flex flex-col justify-between overflow-y-auto no-scrollbar pb-[180px] md:pb-6 ${
          activeMobileTab === 'configure' ? 'flex' : 'hidden md:flex'
        }`}>
          <div className="flex flex-col gap-4 overflow-y-hidden flex-1">
            
            {/* Selection Drawer */}
            <div className="p-4 bg-[var(--bg-input)] border border-(--border-color) rounded-2xl space-y-3 flex flex-col min-h-[240px] flex-1">
              <div className="flex items-center justify-between shrink-0">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Select Items to Print</h4>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedIds(products.map(p => p.id))}
                    className="text-[9px] font-bold uppercase text-blue-500 hover:underline cursor-pointer"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIds([])}
                    className="text-[9px] font-bold uppercase text-slate-500 dark:text-slate-400 hover:underline cursor-pointer"
                  >
                    None
                  </button>
                </div>
              </div>

              <div className="relative shrink-0">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter products..."
                  className="w-full pl-9 pr-3 py-1.5 border border-(--border-color) rounded-xl bg-[var(--bg-page)] text-xs text-[var(--color-text)] outline-none focus:border-blue-500 transition-all font-medium"
                />
              </div>

              <div className="overflow-y-auto no-scrollbar space-y-1.5 pt-1 flex-1">
                {filteredProducts.map(product => {
                  const isSelected = selectedIds.includes(product.id);
                  return (
                    <div
                      key={product.id}
                      onClick={() => setSelectedIds(prev => 
                        prev.includes(product.id) ? prev.filter(id => id !== product.id) : [...prev, product.id]
                      )}
                      className={`p-2 rounded-xl flex items-center justify-between cursor-pointer border transition-colors ${
                        isSelected 
                          ? 'bg-blue-500/10 border-blue-500 text-[var(--color-text)]' 
                          : 'bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900/40 border-transparent text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 shrink-0 text-blue-500" />
                        ) : (
                          <Square className="w-4 h-4 shrink-0 text-slate-500" />
                        )}
                        <div className="min-w-0 text-left">
                          <span className="font-semibold block truncate text-xs">{product.product_name}</span>
                          <span className="font-mono text-[9px] text-slate-400">{product.barcode_id}</span>
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">₱{product.selling_price.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Accordion Block 1: Layout Preset */}
            <div className="flex flex-col gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsLayoutPresetOpen(!isLayoutPresetOpen)}
                className="w-full flex items-center justify-between p-3.5 bg-[var(--bg-input)] border border-(--border-color) rounded-2xl cursor-pointer text-left border-none"
              >
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  <Settings className="w-3.5 h-3.5 text-blue-500" />
                  <span>Layout Preset</span>
                </div>
                {isLayoutPresetOpen ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {isLayoutPresetOpen && (
                <div className="p-4 bg-[var(--bg-input)] border border-(--border-color) rounded-2xl space-y-3 shrink-0 animate-slide-up text-left">
                  <div className="grid gap-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Label Layout Template</label>
                    <select
                      value={settings.templateId}
                      onChange={(e) => setSettings(prev => ({ ...prev, templateId: e.target.value as LabelTemplateType }))}
                      className="w-full px-3 py-2 bg-[var(--bg-page)] border border-(--border-color) rounded-xl text-xs text-[var(--color-text)] outline-none cursor-pointer font-semibold"
                    >
                      {Object.values(LABEL_TEMPLATES).map((tmpl) => (
                        <option key={tmpl.id} value={tmpl.id}>
                          {tmpl.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Accordion Block 2: Display Parameters */}
            <div className="flex flex-col gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsDisplayParamsOpen(!isDisplayParamsOpen)}
                className="w-full flex items-center justify-between p-3.5 bg-[var(--bg-input)] border border-(--border-color) rounded-2xl cursor-pointer text-left border-none"
              >
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  <Sliders className="w-3.5 h-3.5 text-blue-500" />
                  <span>Display Parameters</span>
                </div>
                {isDisplayParamsOpen ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {isDisplayParamsOpen && (
                <div className="p-4 bg-[var(--bg-input)] border border-(--border-color) rounded-2xl space-y-3 shrink-0 animate-slide-up text-left">
                  <div className="flex items-center justify-between text-xs py-1">
                    <span className="text-slate-700 dark:text-slate-300 font-medium">Show Product Title</span>
                    <button
                      type="button"
                      onClick={() => setSettings(prev => ({ ...prev, showProductName: !prev.showProductName }))}
                      className="text-blue-500 hover:opacity-85 cursor-pointer"
                    >
                      {settings.showProductName ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8 text-slate-600" />}
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs py-1">
                    <span className="text-slate-700 dark:text-slate-300 font-medium">Show Item Price</span>
                    <button
                      type="button"
                      onClick={() => setSettings(prev => ({ ...prev, showPrice: !prev.showPrice }))}
                      className="text-blue-500 hover:opacity-85 cursor-pointer"
                    >
                      {settings.showPrice ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8 text-slate-600" />}
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs py-1">
                    <span className="text-slate-700 dark:text-slate-300 font-medium">Show Barcode text</span>
                    <button
                      type="button"
                      onClick={() => setSettings(prev => ({ ...prev, showBarcodeText: !prev.showBarcodeText }))}
                      className="text-blue-500 hover:opacity-85 cursor-pointer"
                    >
                      {settings.showBarcodeText ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8 text-slate-600" />}
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs border-t border-(--border-color) pt-3 mt-1 gap-2">
                    <span className="text-slate-700 dark:text-slate-300 font-medium">Global Copies</span>
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      value={settings.copies}
                      onChange={(e) => setSettings(prev => ({ ...prev, copies: Math.max(1, parseInt(e.target.value) || 1) }))}
                      className="w-16 px-2.5 py-1.5 bg-[var(--bg-page)] border border-(--border-color) rounded-xl text-xs text-[var(--color-text)] text-center outline-none font-bold font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Action Row Panel */}
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-[var(--bg-card)]/95 border-t border-(--border-color) z-[201] md:relative md:p-0 md:bg-transparent md:border-t-0 md:z-auto shrink-0 shadow-lg md:shadow-none space-y-2 mt-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handlePrint}
                disabled={printableItemsList.length === 0 || generating}
                className="py-3 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed text-white text-[11px] font-heading tracking-wider uppercase rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md font-extrabold border-none cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print ({expandedItemsList.length})</span>
              </button>

              <button
                type="button"
                onClick={handleDownload}
                disabled={printableItemsList.length === 0 || generating}
                className="py-3 px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-white text-[11px] font-heading tracking-wider uppercase rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md font-extrabold border border-slate-700 cursor-pointer"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span>Download PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT PREVIEW PANEL */}
        <div className={`lg:col-span-8 bg-[var(--bg-page)] p-6 flex flex-col justify-between overflow-hidden relative ${
          activeMobileTab === 'preview' ? 'flex' : 'hidden md:flex'
        }`}>
          
          {/* Zoom floating toolbar */}
          <div className="absolute top-4 right-4 z-10 animate-fade-in">
            <div className="bg-[var(--bg-input)] border border-(--border-color) p-2 rounded-xl flex items-center justify-between gap-3 text-xs w-fit shadow-lg">
              <button 
                onClick={() => setSettings(prev => ({ ...prev, zoom: Math.max(50, prev.zoom - 25) }))}
                className="p-1 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
                title="Zoom layout preview out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="font-mono font-bold text-[10px] tracking-wider text-[var(--color-text)] w-12 text-center select-none">
                {settings.zoom}%
              </span>
              <button 
                onClick={() => setSettings(prev => ({ ...prev, zoom: Math.min(150, prev.zoom + 25) }))}
                className="p-1 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
                title="Zoom layout preview in"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <div className="w-px h-4 bg-white/10" />
              <button 
                onClick={() => setSettings(prev => ({ ...prev, zoom: 100 }))}
                className="p-1 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
                title="Reset zoom actual scale"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Live Page Layout Sheet */}
          <div className="flex-1 flex flex-col h-full bg-[var(--bg-card)] rounded-3xl p-5 border border-(--border-color) overflow-hidden shadow-xs">
            <div className="flex justify-between items-center pb-4 border-b border-(--border-color) mb-4 shrink-0">
              <div className="text-left">
                <h4 className="text-xs font-heading uppercase tracking-widest text-[var(--color-text)]">Live Layout Sheets</h4>
                <span className="text-[10px] text-slate-400 font-bold block mt-0.5">
                  Format: {LETTER_PAPER.name} • {template.labelsPerPage} Labels/Sheet
                </span>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs font-mono font-bold text-blue-500 block">
                  {expandedItemsList.length} Total Stickers
                </span>
                <span className="text-[10px] text-slate-400 font-bold block mt-0.5">
                  Requires {totalPagesRequired} {totalPagesRequired === 1 ? 'Page' : 'Pages'}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 flex flex-col items-center justify-start gap-6 no-scrollbar">
              <div 
                style={{
                  width: `${scaledWidthMm}mm`,
                  height: `${scaledHeightMm}mm`,
                }}
                className="mx-auto relative shrink-0"
              >
                <div 
                  style={{ 
                    transform: `scale(${zoomFactor})`, 
                    transformOrigin: 'top left',
                    width: `${LETTER_PAPER.width}mm`,
                    height: `${LETTER_PAPER.height * totalPagesRequired}mm` 
                  }}
                  className="absolute top-0 left-0"
                  id="barcode-printable-area"
                >
                  {Array.from({ length: totalPagesRequired }).map((_, pageIdx) => {
                    const pageStartIndex = pageIdx * template.labelsPerPage;
                    const pageLabels = expandedItemsList.slice(pageStartIndex, pageStartIndex + template.labelsPerPage);
                    return (
                      <div 
                        key={`page-${pageIdx}`}
                        className="print-page-sheet bg-white shadow-2xl relative border border-slate-300 overflow-hidden mx-auto shrink-0 mb-6 origin-top animate-fade-in"
                        style={{
                          width: `${LETTER_PAPER.width}mm`,
                          height: `${LETTER_PAPER.height}mm`,
                        }}
                      >
                        <div 
                          className="grid"
                          style={{
                            paddingTop: `${template.marginTop}mm`,
                            paddingLeft: `${template.marginLeft}mm`,
                            gridTemplateColumns: `repeat(${template.cols}, ${template.labelWidth}mm)`,
                            gap: `${template.gapVertical}mm ${template.gapHorizontal}mm`,
                            alignContent: 'start',
                            alignItems: 'start',
                          }}
                        >
                          {pageLabels.map((item, idx) => (
                            <div 
                              key={`${pageIdx}-${idx}-${item.id}`}
                              className="print-label-item flex flex-col items-center justify-between bg-white text-black overflow-hidden select-none p-1.5"
                              style={{
                                width: `${template.labelWidth}mm`,
                                height: `${template.labelHeight}mm`,
                                border: '1px dashed #cbd5e1',
                              }}
                            >
                              {settings.showProductName && (
                                <span 
                                  className="text-center leading-tight truncate w-full px-1 block text-slate-900 uppercase font-black"
                                  style={{ fontSize: isSmallLabel ? '6.5px' : '8.5px' }}
                                >
                                  {item.product_name}
                                </span>
                              )}
                              <div className="w-full flex justify-center py-0.5 max-h-[45%] overflow-hidden shrink-0">
                                <BarcodeComponent value={item.barcode_id} height={svgHeight} margin={svgMargin} />
                              </div>
                              <div className="flex flex-col items-center leading-none mt-auto">
                                {settings.showBarcodeText && (
                                  <span 
                                    className="font-mono font-bold text-slate-500 tracking-wider"
                                    style={{ fontSize: isSmallLabel ? '6px' : '8px' }}
                                  >
                                    {item.barcode_id}
                                  </span>
                                )}
                                {settings.showPrice && (
                                  <span 
                                    className="font-extrabold text-slate-900 mt-0.5"
                                    style={{ fontSize: isSmallLabel ? '7.5px' : '10px' }}
                                  >
                                    ₱{Number(item.selling_price).toFixed(2)}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>,
    document.body
  );
};