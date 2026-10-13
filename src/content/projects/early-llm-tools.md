---
title: "Early LLM tools"
tagline: "Building with GPT-4 since the plugin days: long-term memory, private retrieval, and music recommendations."
year: "2023"
kind: "experiment"
role: "Solo developer"
stack: ["Python", "Pinecone", "ChatGPT plugins", "Autoencoders"]
scene: "jasper-sky-2"
order: 9
links:
  repo: "https://github.com/SergeSerb2/Memory-GPT-Plugin"
---

In 2023 I built on the first wave of LLM tooling. Two of these are still my most-starred repositories.

- **[Memory-GPT Plugin](https://github.com/SergeSerb2/Memory-GPT-Plugin).** OpenAI's retrieval plugin let ChatGPT read from a memory. This plugin let it write to one: it embedded whatever ChatGPT chose to remember and stored it in the same Pinecone index.
- **[ChatGPT Retrieval GUI](https://github.com/SergeSerb2/gui-chatgpt-retrieval).** Point it at a folder of documents and your keys. It embedded the files, filled a Pinecone index, and started a personal retrieval plugin, with no command line.
- **AI song recommender.** A dataset of about 1.9 million songs with their audio features, an autoencoder to embed them, and vector search to find songs like the one you give it. You could also ask for something similar but happier, sadder, or more energetic.

The same year I built a GPT-4 function-calling assistant for real-estate data as a contractor. It is on the [résumé](/resume).
