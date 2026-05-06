import { vi } from "vitest";

const mockPL = class {};
vi.mock("promptlayer", (PL: any) => ({
  default: mockPL,
  PromptLayer: mockPL,
}));

vi.mock("#shared/utils/prompt-logger.js", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    log: vi.fn(),
  } as any;
});

vi.mock("date-fns", () => ({
  formatDistanceToNow: () => "just now",
  format: () => "2024-01-01",
  formatISO: () => "2024-01-01T00:00:00.000Z",
  parseISO: () => new Date("2024-01-01"),
  addDays: () => new Date("2024-01-02"),
  subDays: () => new Date("2023-12-31"),
  isAfter: () => false,
  isBefore: () => false,
  isEqual: () => false,
  startOfDay: () => new Date("2024-01-01"),
  endOfDay: () => new Date("2024-01-01T23:59:59.999Z"),
  differenceInDays: () => 0,
  differenceInHours: () => 0,
  differenceInMinutes: () => 0,
  differenceInSeconds: () => 0,
  eachDayOfInterval: () => [new Date("2024-01-01")],
  eachMonthOfInterval: () => [new Date("2024-01-01")],
  startOfMonth: () => new Date("2024-01-01"),
  endOfMonth: () => new Date("2024-01-31"),
  startOfWeek: () => new Date("2024-01-01"),
  endOfWeek: () => new Date("2024-01-07"),
  getDay: () => 0,
  getDaysInMonth: () => 30,
  getMonth: () => 0,
  getYear: () => 2024,
  setMonth: () => new Date("2024-02-01"),
  setYear: () => new Date("2025-01-01"),
  addMonths: () => new Date("2024-02-01"),
  subMonths: () => new Date("2023-12-01"),
  addHours: () => new Date("2024-01-01T01:00:00"),
  subHours: () => new Date("2023-12-31T23:00:00"),
  addMinutes: () => new Date("2024-01-01T00:01:00"),
  subMinutes: () => new Date("2023-12-31T23:59:00"),
  addSeconds: () => new Date("2024-01-01T00:00:01"),
  subSeconds: () => new Date("2023-12-31T23:59:59"),
  parse: () => new Date("2024-01-01"),
  isValid: () => true,
  isToday: () => false,
  isTomorrow: () => false,
  isYesterday: () => false,
  isThisWeek: () => false,
  isThisMonth: () => false,
  isThisYear: () => false,
}));
