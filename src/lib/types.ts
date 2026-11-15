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

export type MockTurn = { role: "interviewer" | "candidate"; text: string; tag?: "Q" | "F" | "END"; at: string };

export type MockInterview = {
  id: string;
  session_id: string;
  kind: "behavioral" | "technical" | "mixed";
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
