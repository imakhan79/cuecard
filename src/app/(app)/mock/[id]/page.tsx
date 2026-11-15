import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MockRoom } from "@/components/mock/mock-room";
import { getUser } from "@/lib/supabase/server";
import type { MockInterview } from "@/lib/types";

export const metadata: Metadata = { title: "Mock interview" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const { supabase } = await getUser();
  const { data: mock } = await supabase
    .from("mock_interviews")
    .select("id, session_id, kind, question_count, status, transcript, report, overall_score, created_at, completed_at")
    .eq("id", id)
    .maybeSingle<MockInterview>();
  if (!mock) notFound();

  const { data: session } = await supabase
    .from("interview_sessions")
    .select("title")
    .eq("id", mock.session_id)
    .maybeSingle<{ title: string }>();

  return <MockRoom key={mock.id} mock={mock} title={session?.title ?? "Interview"} />;
}
