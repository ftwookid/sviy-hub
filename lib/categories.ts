export const SCHEDULE_C_CATEGORIES = [
  "Advertising",
  "Car & Truck",
  "Commissions & Fees",
  "Contract Labor",
  "Depreciation",
  "Employee Benefits",
  "Insurance",
  "Interest — Mortgage",
  "Interest — Other",
  "Legal & Professional",
  "Meals & Entertainment",
  "Office Expense",
  "Other Expense",
  "Pension & Profit Sharing",
  "Rent — Machinery",
  "Rent — Other Business Property",
  "Repairs & Maintenance",
  "Supplies",
  "Taxes & Licenses",
  "Travel",
  "Utilities",
  "Wages"
] as const;

const TAG_PALETTE = [
  { background: "#F0E8D8", text: "#6F562B" },
  { background: "#EAF4EE", text: "#37684F" },
  { background: "#FBF3E3", text: "#72511E" },
  { background: "#FAEAEA", text: "#733030" },
  { background: "#ECE9F1", text: "#5C5268" },
  { background: "#E8F1F0", text: "#3F6663" },
  { background: "#F3ECE5", text: "#6A5140" },
  { background: "#EEF0E8", text: "#596141" }
];

export function categoryTagColors(category: string) {
  const hash = category.split("").reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
  return TAG_PALETTE[hash % TAG_PALETTE.length];
}
