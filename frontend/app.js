const API_URL = 'http://127.0.0.1:8000/correct';

const editor = document.getElementById('editor');
const wordCount = document.getElementById('word-count');
const statusIndicator = document.getElementById('status-indicator');
const issuesList = document.getElementById('issues-list');
const issueCount = document.getElementById('issue-count');

let typingTimer;
const typingInterval = 600; // ms to wait after typing

editor.addEventListener('input', () => {
    clearTimeout(typingTimer);
    updateWordCount();
    
    statusIndicator.textContent = 'Typing...';
    statusIndicator.style.color = 'var(--text-secondary)';
    
    if (editor.value.trim() !== '') {
        typingTimer = setTimeout(checkSpelling, typingInterval);
    } else {
        clearIssues();
        statusIndicator.textContent = 'All good';
        statusIndicator.style.color = 'var(--success-color)';
    }
});

function updateWordCount() {
    const words = editor.value.trim().split(/\s+/).filter(w => w.length > 0);
    wordCount.textContent = `${words.length} word${words.length !== 1 ? 's' : ''}`;
}

function clearIssues() {
    issuesList.innerHTML = `
        <div class="empty-state">
            Your text looks perfect! No corrections needed.
        </div>
    `;
    issueCount.textContent = '0';
}

async function checkSpelling() {
    statusIndicator.textContent = 'Checking...';
    
    const text = editor.value;
    const wordMatches = text.match(/\b[a-zA-Z]+\b/g) || []; // Extract purely alphabetical words bounds
    const wordsToCheck = [...new Set(wordMatches)]; // Unique words only
    
    if (wordsToCheck.length === 0) {
        clearIssues();
        statusIndicator.textContent = 'All good';
        statusIndicator.style.color = 'var(--success-color)';
        return;
    }

    const issues = [];
    
    try {
        const checks = await Promise.all(
            wordsToCheck.map(word => 
                fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ word })
                }).then(res => res.json())
                .catch(err => {
                    console.error('API Error:', err);
                    return { is_correct: true }; 
                })
            )
        );
        
        for (let i = 0; i < wordsToCheck.length; i++) {
            const result = checks[i];
            
            if (!result.is_correct && result.suggestions && result.suggestions.length > 0) {
                // Ignore if the best match is identical to the typed word (ignoring case)
                if (result.suggestions[0].word.toLowerCase() === wordsToCheck[i].toLowerCase()) continue;
                
                issues.push({
                    original: wordsToCheck[i],
                    suggestions: result.suggestions
                });
            }
        }
        
        renderIssues(issues);
        
    } catch (err) {
        console.error('Failed to check spelling', err);
        statusIndicator.textContent = 'Backend offline';
        statusIndicator.style.color = 'var(--error-color)';
    }
}

function renderIssues(issues) {
    if (issues.length === 0) {
        clearIssues();
        statusIndicator.textContent = 'All good';
        statusIndicator.style.color = 'var(--success-color)';
        return;
    }

    statusIndicator.textContent = `${issues.length} issue${issues.length > 1 ? 's' : ''} found`;
    statusIndicator.style.color = 'var(--error-color)';
    issueCount.textContent = issues.length;
    
    issuesList.innerHTML = '';
    
    issues.forEach(issue => {
        const issueEl = document.createElement('div');
        issueEl.className = 'issue-card';
        
        const header = document.createElement('div');
        header.className = 'issue-header';
        header.innerHTML = `Unknown: <span class="misspelled">"${issue.original}"</span>`;
        issueEl.appendChild(header);
        
        const topSuggestions = issue.suggestions.slice(0, 3);
        
        topSuggestions.forEach(sug => {
            const btn = document.createElement('button');
            btn.className = 'suggestion-btn';
            
            const probStr = parseFloat(sug.probability).toExponential(2);
            
            btn.innerHTML = `
                <span class="suggestion-word">${sug.word}</span>
                <span class="suggestion-prob">Confidence: ${probStr}</span>
            `;
            
            btn.onclick = () => fixWord(issue.original, sug.word);
            
            issueEl.appendChild(btn);
        });
        
        issuesList.appendChild(issueEl);
    });
}

function fixWord(original, replacement) {
    // Replace all instances of the misspelled word
    const regex = new RegExp(`\\b${original}\\b`, 'g');
    
    editor.value = editor.value.replace(regex, (match) => {
        // preserve capitalization
        if (match[0] === match[0].toUpperCase()) {
            return replacement.charAt(0).toUpperCase() + replacement.slice(1);
        }
        return replacement;
    });
    
    editor.focus();
    updateWordCount();
    checkSpelling(); // Re-check the document
}
