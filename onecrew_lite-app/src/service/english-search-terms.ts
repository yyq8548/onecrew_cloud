import { newStemmer } from "snowball-stemmers";

// 搜索目录和商品匹配复用原 Lucene 英文停用词与词形处理。
const stopWords = new Set(["a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "if", "in", "into", "is", "it", "no", "not", "of", "on", "or", "such", "that", "the", "their", "then", "there", "these", "they", "this", "to", "was", "will", "with"]);
const stemmer = newStemmer("english");
export const tokenize = (text: string) => text.split(/[^\p{Alphabetic}\p{Number}]+/u).filter(Boolean);
export function processTerm(term: string): string | null { if (Buffer.byteLength(term) >= 40) return null; const lower = term.toLowerCase(); return stopWords.has(lower) ? null : stemmer.stem(lower); }
export function mcpEnglishSearchTerms(text: string): string[] { return [...new Set(tokenize(text).map(processTerm).filter((term): term is string => term !== null))].sort(); }
