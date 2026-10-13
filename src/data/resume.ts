export interface Role {
  title: string;
  org: string;
  orgUrl?: string;
  start: string;
  end: string;
  summary: string;
  points: string[];
  stack?: string[];
}

export const experience: Role[] = [
  {
    title: "Machine Learning Engineer",
    org: "PressReader",
    orgUrl: "https://www.pressreader.com",
    start: "2024",
    end: "Now",
    summary: "Machine learning for a platform that delivers thousands of newspapers and magazines worldwide.",
    points: [],
  },
  {
    title: "Software Developer",
    org: "Sapphire4U",
    start: "2016 — 2019, 2023",
    end: "Now",
    summary: "Family software studio working on freelance projects.",
    points: [
      "Admin and instructor console for the Canadian Flight Centre.",
      "Automatic Excel reports from aircraft status and flight-lesson data.",
      "Chrome extension that automated financial-report downloads for Merchant Growth.",
    ],
    stack: ["JavaScript", "PHP", "MySQL", "Yii"],
  },
  {
    title: "Software Engineer (Contract)",
    org: "EveryState",
    start: "2023",
    end: "2023",
    summary: "Built an AI real-estate assistant on GPT-4 function calling.",
    points: [
      "Natural-language questions over EveryState's listings, agents, and market data.",
      "Answers queries like the best price reductions within 30 miles of a city, or the top agents in a state by volume.",
    ],
    stack: ["Python", "GPT-4", "JavaScript"],
  },
  {
    title: "System Administrator",
    org: "PressReader",
    orgUrl: "https://www.pressreader.com",
    start: "2020",
    end: "2021",
    summary: "Network Operations Centre for a worldwide newspaper and magazine platform.",
    points: [
      "Quality control of publications, legal and content-removal requests, and XML layout fixes.",
      "Built the team's shift scheduler as a side project, used by a department of 30+.",
    ],
    stack: ["Node.js", "MS SQL", "XML"],
  },
];

export const education = [
  {
    degree: "BSc, Computer Science",
    school: "University of British Columbia",
    start: "2019",
    end: "2023",
  },
];

export const skills: Record<string, string[]> = {
  Languages: ["TypeScript", "Python", "Swift", "Rust", "JavaScript", "C#", "Java", "C++"],
  "AI & data": ["LLM apps and agents", "Speech-to-text pipelines", "Vector search", "PyTorch", "TensorFlow"],
  Platforms: ["iOS (SwiftUI)", "Web (React, Next.js, Astro)", "Node.js", "Electron"],
  Infrastructure: ["Google Cloud", "Cloudflare", "Railway", "Docker", "GitHub Actions"],
  Databases: ["PostgreSQL", "SQLite", "MySQL", "MS SQL", "MongoDB", "Pinecone"],
};

export const volunteering = [
  {
    title: "Track & Field Coach",
    org: "McMath Secondary",
    start: "2022",
    end: "Now",
    summary: "Coach for a team of 60+ athletes, many competing at provincials.",
  },
];
