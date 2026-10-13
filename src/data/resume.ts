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
    title: "Lead Engineer (Contract)",
    org: "Broadcast monitoring platform, private client",
    start: "2025",
    end: "Now",
    summary: "Round-the-clock radio and TV monitoring with live transcripts, AI segment detection, and one dashboard.",
    points: [
      "24/7 stream ingest with health checks, and local speech-to-text with a cloud fallback.",
      "Language models split transcripts into segments and summarize them.",
      "Wrote most of the system; staging deploys on every merge, production on Google Cloud Run.",
    ],
    stack: ["Python", "TypeScript", "Speech-to-text", "LLMs", "Google Cloud Run"],
  },
  {
    title: "Chief Technology Officer",
    org: "PartyMeIN",
    start: "2023",
    end: "2024",
    summary: "First engineer and CTO of a Vancouver start-up. Built the iOS app from the ground up.",
    points: [
      "Sole developer of the first public release, written in Swift.",
      "Owned design, core features, performance, and the backend.",
      "The app finds the best time for an event from friends' imported calendars.",
    ],
    stack: ["Swift", "SwiftUI", "JavaScript"],
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
  {
    title: "Software Developer",
    org: "Sapphire4U",
    start: "2016",
    end: "2019",
    summary: "Family software studio working on freelance projects.",
    points: [
      "Admin and instructor console for the Canadian Flight Centre.",
      "Automatic Excel reports from aircraft status and flight-lesson data.",
      "Chrome extension that automated financial-report downloads for Merchant Growth.",
    ],
    stack: ["JavaScript", "PHP", "MySQL", "Yii"],
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
