import { z } from "zod";

export const FeedbackSchema = z.object({
  score: z.number().min(1).max(10),
  summary: z.string(),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  resume_conflicts: z.array(z.string()),
  improved_answer: z.string(),
});
export type Feedback = z.infer<typeof FeedbackSchema>;

export const MockReportSchema = z.object({
  overall_score: z.number().min(1).max(10),
  hire_signal: z.enum(["strong_yes", "yes", "lean_no", "no"]),
  summary: z.string(),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  communication: z.string(),
  questions: z.array(
    z.object({
      question: z.string(),
      score: z.number().min(1).max(10),
      feedback: z.string(),
      model_answer: z.string(),
    }),
  ),
});
export type MockReport = z.infer<typeof MockReportSchema>;

export type MockKind =
  | "behavioral"
  | "technical"
  | "mixed"
  | "coding"
  | "system_design"
  | "product_case"
  | "case_study"
  | "salary_negotiation"
  | "redrill";

export const PrepSchema = z.object({
  requirements: z.array(z.object({ requirement: z.string(), coverage: z.enum(["strong", "partial", "missing"]), evidence: z.string() })),
  checklist: z.array(z.object({ id: z.string(), task: z.string(), category: z.string() })),
  likely_topics: z.array(z.string()),
});
export type Prep = z.infer<typeof PrepSchema>;

export const DebriefSchema = z.object({
  readiness: z.number().min(1).max(10),
  summary: z.string(),
  worked: z.array(z.string()),
  weak_spots: z.array(z.string()),
  next_steps: z.array(z.string()),
  questions_seen: z.array(z.string()),
});
export type Debrief = z.infer<typeof DebriefSchema>;

export type MockTurn = { role: "interviewer" | "candidate"; text: string; tag?: "Q" | "F" | "END"; at: string };

export type MockInterview = {
  id: string;
  session_id: string;
  kind: MockKind;
  question_count: number;
  status: "in_progress" | "completed";
  transcript: MockTurn[];
  report: MockReport | null;
  overall_score: number | null;
  created_at: string;
  completed_at: string | null;
};

export type Resume = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type InterviewSession = {
  id: string;
  title: string;
  company: string | null;
  role: string | null;
  job_description: string | null;
  meeting_url: string | null;
  interview_type?: string | null;
  prep?: Prep | null;
  prep_checked?: string[];
  resume_id: string | null;
  created_at: string;
};

export type Answer = {
  id: string;
  question_id: string;
  content: string;
  score: number | null;
  feedback: Feedback | null;
  created_at: string;
};

export type Question = {
  id: string;
  session_id: string;
  source: "live" | "practice" | "copilot";
  question: string;
  suggested_answer: string | null;
  created_at: string;
  answers?: Answer[];
};
