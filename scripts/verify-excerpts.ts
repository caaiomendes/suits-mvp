import {
  grepCorpusExcerpts,
  shouldInjectCorpusExcerpts,
} from "../lib/rag/excerpts";

async function main() {
  if (shouldInjectCorpusExcerpts("oi, tudo bem?")) {
    throw new Error("saudação não deveria acionar o corpus");
  }
  if (!shouldInjectCorpusExcerpts("o que diz o art. 121 do CP?")) {
    throw new Error("art. 121 deveria acionar o corpus");
  }
  const hits = await grepCorpusExcerpts("o que diz o art. 121 do Código Penal?");
  if (hits.length === 0) {
    throw new Error("grep não achou art. 121");
  }
  if (hits.some((hit) => hit.text.length > 1300)) {
    throw new Error("trecho longo demais");
  }
  console.log(
    "ok",
    hits.map((hit) => `${hit.source} (${hit.text.length}c)`).join(" | "),
  );
}

void main();
