/**
 * Pre-built rubric templates for common assignment types.
 * Each template includes a minimal PDF (base64) for n8n compatibility.
 */

// Minimal valid PDF (single blank page) - used when no custom rubric is uploaded
const MINIMAL_PDF_BASE64 =
  "JVBERi0xLjQKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovTWVkaWFCb3ggWzAgMCA2MTIgNzkyXQo+PgplbmRvYmoKdHJhaWxlcgo8PAovU2l6ZSA0Ci9Sb290IDEgMCBSCj4+CnN0YXJ0eHJlZgoxNzQKJSVFT0YK";

export interface RubricTemplate {
  id: string;
  name: string;
  description: string;
  criteria: Record<string, { maxScore: number; description: string }>;
}

export const RUBRIC_TEMPLATES: RubricTemplate[] = [
  {
    id: "essay",
    name: "Essay",
    description: "General essay rubric for argumentative or analytical writing",
    criteria: {
      thesis: { maxScore: 20, description: "Clear thesis statement and argument" },
      evidence: { maxScore: 25, description: "Use of evidence and examples" },
      organization: { maxScore: 20, description: "Structure and flow" },
      analysis: { maxScore: 20, description: "Depth of analysis" },
      mechanics: { maxScore: 15, description: "Grammar, spelling, formatting" },
    },
  },
  {
    id: "lab-report",
    name: "Lab Report",
    description: "Scientific lab report rubric",
    criteria: {
      hypothesis: { maxScore: 15, description: "Clear hypothesis and objectives" },
      methods: { maxScore: 20, description: "Procedure and methodology" },
      results: { maxScore: 25, description: "Data presentation and accuracy" },
      analysis: { maxScore: 25, description: "Interpretation and discussion" },
      conclusion: { maxScore: 15, description: "Conclusions and recommendations" },
    },
  },
  {
    id: "math-problem",
    name: "Math Problem",
    description: "Mathematical problem-solving rubric",
    criteria: {
      setup: { maxScore: 25, description: "Correct setup and approach" },
      solution: { maxScore: 40, description: "Correct solution steps" },
      explanation: { maxScore: 20, description: "Clear reasoning and explanation" },
      units: { maxScore: 15, description: "Correct units and final answer" },
    },
  },
  {
    id: "presentation",
    name: "Presentation",
    description: "Oral or slide presentation rubric",
    criteria: {
      content: { maxScore: 30, description: "Quality and depth of content" },
      organization: { maxScore: 20, description: "Structure and clarity" },
      delivery: { maxScore: 25, description: "Delivery and engagement" },
      visuals: { maxScore: 15, description: "Use of visuals and aids" },
      qa: { maxScore: 10, description: "Q&A handling" },
    },
  },
];

export function getTemplatePdfBase64(): string {
  return MINIMAL_PDF_BASE64;
}
