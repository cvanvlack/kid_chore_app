export const CONFIG = {
  // Your Apps Script Web App URL (the /exec URL)
  API_URL: 'https://script.google.com/macros/s/AKfycbzaFXY09GiuxI9MEefVqriWPFR5poe40-_Nhlgyg47flEdpwlC9nRqJPSn__Td_pxO2/exec',

  // Kid IDs must match Config tab: k1, k2, k3
  KIDS: [
    { id: 'k1', name: 'Alice' },
    { id: 'k2', name: 'Bob' },
    { id: 'k3', name: 'Charlie' },
  ],
} as const
