import type { Metadata } from "next";
import { PlanMapApp } from "./components/PlanMapApp";

export const metadata: Metadata = {
  title: "思维导图快捷工具",
  description: "只管说想法，结构与排版交给 AI。",
};

export default function Home() {
  return <PlanMapApp />;
}
