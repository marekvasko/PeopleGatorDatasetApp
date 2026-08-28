export interface VoteSummary {
  name: string;
  count: number;
  total: number;
  percentage: number;
}

export interface FaceOccurrence {
  id: string;
  library: string;
  document: string;
  page: string;
  cropName: string;
  facePath: string;
  pageWidth: number;
  pageHeight: number;
  pageLeft: number;
  pageTop: number;
  width: number;
  height: number;
  confidence: number | null;
  displayName: string | null;
  votes: VoteSummary[];
}

export interface ScanSummary {
  id: string;
  library: string;
  document: string;
  page: string;
  imagePath: string;
  faceCount: number;
  namedFaceCount: number;
  people: string[];
}

export interface ScanDetail extends ScanSummary {
  pageWidth: number;
  pageHeight: number;
  faces: FaceOccurrence[];
  sourceUrl: string | null;
}

export interface PersonSummary {
  name: string;
  faceCount: number;
  averageAgreement: number;
  previewFacePath: string | null;
}

export interface PersonDetail extends PersonSummary {
  faces: FaceOccurrence[];
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ArchiveStats {
  scans: number;
  detections: number;
  annotatedFaces: number;
  people: number;
  libraries: number;
  annotationRows: number;
  uniqueVotes: number;
}

export interface LibrarySummary {
  name: string;
  scanCount: number;
  faceCount: number;
}
