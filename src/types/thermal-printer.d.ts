export type NativePrinterType = 'bluetooth' | 'usb';

export type NativePrinterDevice = {
  id?: string | number;
  address?: string;
  deviceName?: string;
  name?: string;
  vendorId?: number;
  productId?: number;
};

type ThermalPrinterApi = {
  listPrinters: (
    data: { type: NativePrinterType },
    success: (result: NativePrinterDevice[] | { printers?: NativePrinterDevice[] }) => void,
    error: (err: unknown) => void,
  ) => void;
  requestPermissions: (
    data: { type: NativePrinterType; id?: string | number },
    success: (result: unknown) => void,
    error: (err: unknown) => void,
  ) => void;
  printFormattedText: (
    data: {
      type: NativePrinterType;
      id?: string | number;
      text: string;
      mmFeedPaper?: number;
      dotsFeedPaper?: number;
    },
    success: (result: unknown) => void,
    error: (err: unknown) => void,
  ) => void;
  disconnectPrinter: (
    data: { type: NativePrinterType; id?: string | number },
    success: (result: unknown) => void,
    error: (err: unknown) => void,
  ) => void;
};

declare global {
  interface Window {
    ThermalPrinter?: ThermalPrinterApi;
  }
}

export {};
