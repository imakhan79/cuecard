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
  source: "live" | "practice";
  question: string;
  suggested_answer: string | null;
  created_at: string;
  answers?: Answer[];
};
