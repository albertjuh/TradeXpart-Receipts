export interface Receipt {
  id: string;
  storeName: string;
  amount: number;
  date: string;
  category: string;
  imageUrl?: string;
  notes?: string;
  createdAt: string;
  source?: string;
  driveFileId?: string;
}

export const CATEGORIES = [
  "Food",
  "Transport",
  "Business",
  "Shopping",
  "Utilities",
  "Other"
];
