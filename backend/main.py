import re
import os
from collections import Counter
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Autocorrect API")

# Allow CORS for localhost frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CorrectionRequest(BaseModel):
    word: str

# Load Dataset
def process_data(file_name):
    # Determine the path dynamically relative to the backend folder
    with open(file_name, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        words = []
        for line in lines:
            line = line.strip().lower()
            word_list = re.findall(r'\w+', line)
            words.extend(word_list)
    return words

print("Loading vocabulary and calculating probabilities... This may take a moment.")
dataset_path = os.path.join(os.path.dirname(__file__), '..', 'dataset.txt')
words = process_data(dataset_path)
vocab = set(words)
word_counts = Counter(words)

def get_probs(word_counts):
    probs = {}
    m = sum(word_counts.values())
    for word in word_counts:
        probs[word] = word_counts[word] / m
    return probs

probs = get_probs(word_counts)
print(f"Loaded {len(vocab)} unique words.")

def edit_one_letter(word, allow_swaps=True):
    letters = 'abcdefghijklmnopqrstuvwxyz'
    splits = [(word[:i], word[i:]) for i in range(len(word) + 1)]
    deletes = [L + R[1:] for L, R in splits if R]
    swaps = [L + R[1] + R[0] + R[2:] for L, R in splits if len(R)>1] if allow_swaps else []
    replaces = [L + c + R[1:] for L, R in splits if R for c in letters]
    inserts = [L + c + R for L, R in splits for c in letters]
    return set(deletes + swaps + replaces + inserts)

def edit_two_letters(word, allow_swaps=True):
    edit_one_set = edit_one_letter(word, allow_swaps)
    edit_two_set = set()
    for w in edit_one_set:
        edit_two_set.update(edit_one_letter(w, allow_swaps))
    return edit_two_set

def get_corrections(word, probs, vocab, n=2):
    # 1. If word is in vocab, suggest the word itself
    # 2. Otherwise, suggest words 1 edit away
    # 3. Otherwise, suggest words 2 edits away
    # 4. Otherwise, return the word itself
    suggestions = (word in vocab and {word}) or \
                  edit_one_letter(word).intersection(vocab) or \
                  edit_two_letters(word).intersection(vocab) or \
                  {word}

    best_guesses = sorted([[s, probs.get(s, 0)] for s in suggestions], key=lambda x: x[1], reverse=True)
    return best_guesses[:n]

@app.post("/correct")
def correct_word(req: CorrectionRequest):
    word = req.word.strip().lower()
    if not word:
        return {"original": "", "is_correct": True, "suggestions": []}
    
    corrections_raw = get_corrections(word, probs, vocab, n=5)
    
    suggestions = []
    for s, p in corrections_raw:
        suggestions.append({
            "word": s,
            "probability": p,
            "score": f"{p:.6f}"
        })
        
    return {
        "original": req.word, # return original capitalization
        "is_correct": word in vocab,
        "suggestions": suggestions
    }

@app.get("/health")
def health_check():
    return {"status": "ok", "vocab_size": len(vocab)}
