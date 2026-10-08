export interface Customer { id: string; code: string; name: string }
export interface Product { id: string; customer_id: string; name: string; code: string | null; standard_dimensions: Record<string, number> }
export interface Measurement {
  id: string; inspection_id: string; category: string; label: string;
  value: number | null; value_min: number | null; value_max: number | null;
  unit: string | null; standard_value: number | null;
  tolerance_plus: number | null; tolerance_minus: number | null;
  result: 'PASS' | 'FAIL' | 'INFO'; notes: string | null;
  sort_order: number; readings: TestReading[]
}
export interface TestReading { id: string; value: number; photo_id: string | null; sort_order: number }
export interface Issue {
  id: string; inspection_id: string; defect_type: string; quantity: number | null;
  description: string | null; cause: string | null; repair: string | null;
  cap: string | null; severity: string | null; status: 'OPEN' | 'REPAIRED' | 'ACCEPTED';
  sort_order: number
}
export interface Photo {
  id: string; inspection_id: string; section: string; file_path: string;
  caption: string | null; sort_order: number; issue_id: string | null
}
export interface Inspection {
  id: string; inspection_number: string; customer_id: string; product_id: string;
  customer_name: string; customer_code: string; product_name: string;
  po: string; inspection_type: string; date: string; location: string | null;
  qc_name: string; quantity: number; aql: string | null;
  inspected_quantity: number | null; product_dimensions: Record<string, number>;
  box_dimensions: Record<string, number>; status: string; conclusion: string | null;
  communication_status: string | null; revision: number; updated_at: string;
  photos: Photo[]; issues: Issue[]; measurements: Measurement[]
}
export interface Defect {
  id: string; name: string; aliases: string[]; default_causes: string[];
  default_repairs: string[]; default_cap: string[]; source: string
}
export interface Review {
  errors: string[]; warnings: string[]; photo_counts: Record<string, number>;
  measurement_count: number; issue_count: number
}
export interface ReportPreview { page_count: number; revision: number; pages: string[] }
