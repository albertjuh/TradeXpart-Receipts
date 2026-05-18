export interface Receipt {
  id: string;
  date: string;
  time: string;
  vendor: string;
  amount: number;
  currency: string;
  category: string;
  account_type: 'Business' | 'Personal' | 'Unknown';
  payment_method?: string;
  submitted_by?: string;
  status: 'logged' | 'pending';
  notes?: string;
}

export const CATEGORIES = [
  "Food",
  "Transport",
  "Fuel",
  "Medical",
  "Salary",
  "Maintenance",
  "Utilities",
  "Rent",
  "Supplies",
  "Entertainment",
  "Other",
];
