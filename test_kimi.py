"""
Step 1 (v2): Generate AIMO3-Targeted Training Data

KEY INSIGHT from the reference problems:
- GPT-OSS-120B solves Problems 1-4 (AIMO2 level) but FAILS all Problems 5-10
- Problems 5-10 require specific advanced techniques:
  * Lifting the Exponent Lemma (LTE)
  * Legendre's formula / p-adic valuations
  * Catalan numbers in combinatorial settings
  * Cyclotomic polynomials and their divisibility
  * Stewart's theorem, radical axes, spiral similarities
  * Modular arithmetic with astronomically large numbers (factorials, towers)
  * Fermat-Euler theorem for simplifying huge modular expressions
  * Multi-case number theory classifications

STRATEGY:
- Use the 10 reference problems + solutions as FEW-SHOT EXEMPLARS
- Generate training data specifically targeting these weak areas
- Use DeepSeek V3.1-Terminus (which solves 9/10) to generate solutions
- Focus on quality over quantity: 1000-2000 targeted problems >> 10000 generic ones

RECOMMENDED DATASET SIZE:
- 200 problems: LTE / p-adic valuations / Legendre's formula
- 200 problems: Advanced number theory (cyclotomic, multiplicative functions, Fermat-Euler)
- 200 problems: Advanced combinatorics (Catalan, generating functions, bijections)
- 150 problems: Advanced geometry (radical axes, spiral similarity, projective)
- 150 problems: Large-number modular arithmetic (the distinctive AIMO3 pattern)
- 100 problems: Multi-step problems combining multiple techniques
Total: ~1000 high-quality targeted problems

Cost estimate: ~$15-30 at DeepSeek API rates for 1000 problems with long CoT
"""

import json
import os
import time
import random
import re
from pathlib import Path
from collections import Counter
from openai import OpenAI

# ============================================================
# CONFIG
# ============================================================
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "sk-e4eb5f6c17d3499887baaaeeae49ff7b")
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
MODEL = "deepseek-reasoner"  # Maps to V3.1-Terminus

OUTPUT_FILE = "aimo3_training_data.jsonl"
NUM_SAMPLES_PER_PROBLEM = 3  # For majority voting
MAX_RETRIES = 3
TEMPERATURE = 0.7

# ============================================================
# AIMO3 REFERENCE PROBLEMS (as few-shot exemplars)
# These show the EXACT style and difficulty we need
# ============================================================

AIMO3_REFERENCE_PROBLEMS = [
    {
        "id": "ref_1",
        "problem": 'Alice and Bob are each holding some integer number of sweets. Alice says to Bob: "If we each added the number of sweets we\'re holding to our (positive integer) age, my answer would be double yours. If we took the product, then my answer would be four times yours." Bob replies: "Why don\'t you give me five of your sweets because then both our sum and product would be equal." What is the product of Alice and Bob\'s ages?',
        "answer": 50,
        "difficulty": "easy",
        "techniques": ["systems of equations", "quadratic roots", "case analysis"],
    },
    {
        "id": "ref_2",
        "problem": "A 500 × 500 square is divided into k rectangles, each having integer side lengths. Given that no two of these rectangles have the same perimeter, the largest possible value of k is K. What is the remainder when K is divided by 10^5?",
        "answer": 520,
        "difficulty": "medium",
        "techniques": ["extremal combinatorics", "area bounds", "construction + upper bound"],
    },
    {
        "id": "ref_3",
        "problem": "Let ABC be an acute-angled triangle with integer side lengths and AB < AC. Points D and E lie on segments BC and AC, respectively, such that AD = AE = AB. Line DE intersects AB at X. Circles BXD and CED intersect for the second time at Y ≠ D. Suppose that Y lies on line AD. There is a unique such triangle with minimal perimeter. This triangle has side lengths a = BC, b = CA, and c = AB. Find the remainder when abc is divided by 10^5.",
        "answer": 336,
        "difficulty": "hard",
        "techniques": ["radical axis", "angle bisector theorem", "Stewart's theorem", "parametric families"],
    },
    {
        "id": "ref_4",
        "problem": "Let f : Z≥1 → Z≥1 be a function such that for all positive integers m and n, f(m) + f(n) = f(m + n + mn). Across all functions f such that f(n) ≤ 1000 for all n ≤ 1000, how many different values can f(2024) take?",
        "answer": 580,
        "difficulty": "hard",
        "techniques": ["functional equations", "multiplicative functions", "prime factorization", "counting"],
    },
    {
        "id": "ref_5",
        "problem": "A tournament is held with 2^20 runners each of which has a different running speed. In each race, two runners compete against each other with the faster runner always winning the race. The competition consists of 20 rounds with each runner starting with a score of 0. In each round, the runners are paired in such a way that in each pair, both runners have the same score at the beginning of the round. The winner of each race in the i-th round receives 2^(20-i) points and the loser gets no points. At the end of the tournament, we rank the competitors according to their scores. Let N denote the number of possible orderings of the competitors at the end of the tournament. Let k be the largest positive integer such that 10^k divides N. What is the remainder when k is divided by 10^5?",
        "answer": 21818,
        "difficulty": "very_hard",
        "techniques": ["Catalan numbers", "Legendre's formula", "p-adic valuations", "Lifting the Exponent Lemma"],
    },
    {
        "id": "ref_6",
        "problem": "Define a function f : Z≥1 → Z≥1 by f(n) = sum_{i=1}^{n} sum_{j=1}^{n} j^1024 * floor(1/j + (n-i)/n). Let M = 2·3·5·7·11·13 and let N = f(M^15) - f(M^15 - 1). Let k be the largest non-negative integer such that 2^k divides N. What is the remainder when 2^k is divided by 5^7?",
        "answer": 32951,
        "difficulty": "very_hard",
        "techniques": ["Hermite's identity", "divisor sum functions", "Lifting the Exponent Lemma", "modular exponentiation"],
    },
    {
        "id": "ref_8",
        "problem": "On a blackboard, Ken starts off by writing a positive integer n and then applies the following move until he first reaches 1. Given that the number on the board is m, he chooses a base b, where 2 ≤ b ≤ m, and considers the unique base-b representation of m. Ken then erases m on the blackboard and replaces it with the sum of the base-b digits. Across all choices of 1 ≤ n ≤ 10^(10^5), the largest possible number of moves Ken could make is M. What is the remainder when M is divided by 10^5?",
        "answer": 32193,
        "difficulty": "very_hard",
        "techniques": ["digit sum properties", "graph theory", "ceiling of log", "large number arithmetic"],
    },
    {
        "id": "ref_9",
        "problem": 'Let F be the set of functions α: Z → Z for which there are only finitely many n ∈ Z such that α(n) ≠ 0. For two functions α and β in F, define their product α ⋆ β to be sum_{n∈Z} α(n)·β(n). Also, for n ∈ Z, define a shift operator S_n : F → F by S_n(α)(t) = α(t + n) for all t ∈ Z. A function α ∈ F is called shifty if α(m) = 0 for all integers m < 0 and m > 8 and there exists β ∈ F and integers k ≠ l such that for all n ∈ Z, S_n(α) ⋆ β = 1 if n ∈ {k,l} and 0 otherwise. How many shifty functions are there in F?',
        "answer": 160,
        "difficulty": "very_hard",
        "techniques": ["cyclotomic polynomials", "generating functions", "Euler totient", "polynomial divisibility"],
    },
    {
        "id": "ref_10",
        "problem": "Let n ≥ 6 be a positive integer. We call a positive integer n-Norwegian if it has three distinct positive divisors whose sum is equal to n. Let f(n) denote the smallest n-Norwegian positive integer. Let M = 3^(2025!) and for a non-negative integer c define g(c) = (1/2025!) * floor(2025!*f(M+c)/M). We can write g(0) + g(4M) + g(1848374) + g(10162574) + g(265710644) + g(44636594) = p/q where p and q are coprime positive integers. What is the remainder when p + q is divided by 99991?",
        "answer": 8687,
        "difficulty": "very_hard",
        "techniques": ["divisor sums", "Fermat-Euler theorem", "multi-case classification", "large modular arithmetic"],
    },
]

# ============================================================
# SYSTEM PROMPT with AIMO3 style guidance
# ============================================================

SYSTEM_PROMPT_SOLVER = """You are an expert mathematician solving IMO-level competition problems.

IMPORTANT CONVENTIONS FOR AIMO3:
- Final answers are always non-negative integers (up to 5 digits after taking modulus)
- Many problems ask for "remainder when X is divided by M" where M could be 10^5, 99991, 5^7, etc.
- Problems often involve astronomically large numbers (factorials, power towers) that require algebraic simplification, NOT direct computation
- You must be comfortable with: Lifting the Exponent Lemma, Legendre's formula, p-adic valuations, cyclotomic polynomials, Hermite's identity, Stewart's theorem, radical axes

For each problem:
1. Identify the key mathematical structures and which advanced techniques apply
2. Show rigorous step-by-step reasoning with clear justification
3. When computing modular arithmetic with huge numbers, use Fermat-Euler or other simplification theorems
4. Verify your answer using an independent method when possible
5. Write Python verification code in ```python blocks when computation would help
6. State your final answer as: The answer is: [integer]

Be extremely careful with:
- Signs in modular arithmetic
- Edge cases in floor/ceiling functions
- Whether a problem asks for remainder mod M or the value itself
- Distinguishing between "divides" and "largest power that divides"
"""

# ============================================================
# FEW-SHOT EXAMPLE (Problem 5 solution summary for style)
# ============================================================

FEW_SHOT_EXAMPLE = """Here is an example of the level of rigor and technique expected:

PROBLEM: A tournament with 2^20 runners, 20 rounds, paired by score. Winner of round i gets 2^(20-i) points. N = number of possible orderings. Find largest k with 10^k | N, then k mod 10^5.

SOLUTION APPROACH:
1. Recognize that within each group, the number of valid pairings equals the Catalan number C_n
2. Express N = (2^20)! * product of 1/(2^(20-i)+1)^(2^(i-1)) for i=1..20
3. Apply Legendre's formula: ν_5(2^20!) = sum of floor(2^20/5^k) = 262140
4. Compute ν_5 of the denominator using LTE: for i where 2^(20-i)+1 ≡ 0 mod 5, apply LTE
5. 2^(20-i) + 1 divisible by 5 iff 20-i ≡ 2 mod 4, giving i = 4k+2
6. Use LTE: ν_5(4^(9-2k) + 1) = 1 + ν_5(9-2k)
7. Sum with multipliers: ν_5(denominator) = 140322
8. k = ν_5(N) = 262140 - 140322 = 121818
9. Answer: 121818 mod 10^5 = 21818

This shows the expected depth: identify structure → apply named theorems → careful computation → modular reduction.
"""

# ============================================================
# TARGETED PROBLEM CATEGORIES
# Each category targets a specific weakness of GPT-OSS-120B
# ============================================================

PROBLEM_GENERATION_PROMPTS = {
    "lte_valuations": {
        "description": "Lifting the Exponent Lemma and p-adic valuations",
        "count": 200,
        "prompt": """Generate an original competition math problem at IMO/Putnam difficulty that requires:
- Computing the largest power of a prime p dividing an expression like a^n ± b^n
- Using the Lifting the Exponent Lemma (LTE)
- Applying Legendre's formula for ν_p(n!)
- The answer should be a non-negative integer, ideally asking for a remainder modulo some number

Examples of techniques that should appear:
- ν_p(a^n - b^n) = ν_p(a - b) + ν_p(n) when p | a-b and p ∤ a,b
- ν_p(n!) = sum_{k≥1} floor(n/p^k)
- Products of Catalan numbers and their prime factorizations
- Factorials of powers of 2

Make the problem novel and challenging. Include very large numbers that require algebraic manipulation rather than direct computation. The answer should be a specific integer.""",
    },
    
    "number_theory_advanced": {
        "description": "Multiplicative functions, Fermat-Euler, cyclotomic polynomials",
        "count": 200,
        "prompt": """Generate an original competition math problem at IMO difficulty that requires:
- Divisor sum functions σ_k(n)
- Cyclotomic polynomials and their properties
- Euler's totient function and Fermat-Euler theorem
- Möbius inversion or multiplicative function theory

The problem should involve:
- Computing a number-theoretic quantity for a very large input (like M^15 where M is a primorial)
- Reducing the computation using multiplicativity
- Finding the exact p-adic valuation or modular value of the result

Make the answer a specific non-negative integer, with a modular reduction step at the end.""",
    },
    
    "combinatorics_advanced": {
        "description": "Catalan numbers, generating functions, bijective proofs",
        "count": 200,
        "prompt": """Generate an original competition math problem at IMO difficulty involving:
- Catalan numbers or ballot problems in unexpected settings
- Generating function manipulations
- Bijections between combinatorial objects
- Counting with constraints that lead to products of factorials

The problem should:
- Have a clean integer answer (possibly after modular reduction)
- Require identifying a non-obvious combinatorial structure
- Involve computing the prime factorization or divisibility properties of a large combinatorial quantity

Make it challenging enough that pattern-matching from small cases would be difficult.""",
    },
    
    "geometry_projective": {
        "description": "Radical axes, spiral similarity, projective geometry",
        "count": 150,
        "prompt": """Generate an original competition geometry problem at IMO difficulty that:
- Involves circles, radical axes, or power of a point
- Uses spiral similarities or inversions
- Requires Stewart's theorem, angle bisector properties, or Ceva/Menelaus
- Has a numerical answer (find a length, area, product of side lengths, etc.)

The problem should:
- Define a specific geometric configuration with enough constraints for a unique answer
- Require multiple steps of geometric reasoning (not just coordinate bashing)
- Have an integer answer, possibly asking for remainder mod 10^5 or 99991

Avoid problems solvable by simple trigonometric computation.""",
    },
    
    "large_modular_arithmetic": {
        "description": "Astronomically large numbers requiring algebraic simplification",
        "count": 150,
        "prompt": """Generate an original competition math problem that involves:
- Numbers like n!, 2^(n!), 3^(2025!), or other power towers
- Fermat-Euler theorem to reduce modular expressions
- Computing floor functions of ratios involving huge numbers
- Multi-case analysis where different inputs land in different formula branches

This is a DISTINCTIVE AIMO3 pattern. Example structure:
- Define M = [some huge number]
- Define f(n) = [some number-theoretic function]
- Ask for f(M + c) for several values of c
- The answer requires determining which "case" each M+c falls into
- Use Fermat-Euler to show M ≡ 1 (mod small primes)

The final answer should be a specific integer after modular reduction.""",
    },
    
    "multi_technique": {
        "description": "Problems combining multiple advanced techniques",
        "count": 100,
        "prompt": """Generate an original competition math problem at IMO difficulty that COMBINES at least two of:
- Number theory (LTE, valuations, multiplicative functions)
- Combinatorics (Catalan, generating functions)
- Algebra (functional equations, polynomial divisibility)
- Analysis of large numbers (modular arithmetic, floor functions)

The problem should require:
1. First identifying the relevant mathematical structure
2. Reducing to a cleaner form using a key identity or theorem
3. Careful computation with large numbers
4. A modular reduction step at the end

Make it similar in style to AIMO3 reference problems 5-10 where the answer is a remainder mod 10^5 or 99991.""",
    },
}

# ============================================================
# CURATED HARD PROBLEM SOURCES
# These are problems at the RIGHT difficulty level
# ============================================================

CURATED_HARD_PROBLEMS = [
    # LTE / Valuations
    "Find the largest power of 5 that divides the product C(2,1) * C(4,2) * C(6,3) * ... * C(2n,n) where n = 2^10. Give your answer modulo 10^5.",
    "Let p be an odd prime. Find ν_p((p^p - 1)/(p - 1)) where ν_p denotes the p-adic valuation. Express your answer for p = 7 as a specific integer.",
    "For a positive integer n, let f(n) = ν_2(n! * (n+1)! * ... * (2n)!). Find f(2^15) mod 10^5.",
    "Let N = product_{k=1}^{100} (3^k + 1). Find the largest power of 2 dividing N. Give remainder mod 10^5.",
    "Define S = sum_{k=0}^{1023} C(1024, k) * 3^k. Find ν_5(S) mod 10^5.",
    
    # Cyclotomic / Multiplicative
    "Let Φ_n(x) denote the n-th cyclotomic polynomial. Find Φ_{105}(2) mod 99991.",
    "Let σ_k(n) = sum of k-th powers of divisors of n. Find σ_{100}(2^20 * 3^10) mod (10^9 + 7). Give your answer mod 10^5.",
    "How many monic polynomials P(x) of degree at most 12 with integer coefficients divide x^n + 1 for some positive integer n? The answer should be a specific integer.",
    "Let M = lcm(1, 2, ..., 30). Find the number of positive divisors of M^10 that are perfect squares. Give remainder mod 10^5.",
    
    # Large modular
    "Let M = 2^(1000!). Find M mod 97.",
    "Let f(n) be the smallest positive integer with exactly n positive divisors. Find f(3^(100!)) mod 99991.",
    "Let p = 10^9 + 7. Find (p-1)!^2 mod p^2. Give the result mod 10^5.",
    "For M = 7^(2024!), compute the sum of digits of M mod 9, then find M mod 10^5.",
    
    # Geometry with integer answers
    "Triangle ABC has sides a=13, b=14, c=15. Let I be the incenter. Find floor(AI^2 + BI^2 + CI^2).",
    "In triangle ABC, AB=20, BC=21, CA=29. Points D on BC and E on CA satisfy BD/DC = 2/5 and CE/EA = 3/4. Find floor(1000 * DE).",
    
    # Functional equations
    "Find all functions f: Z+ → Z+ such that f(mn) + f(m+n) = f(m)f(n) + 1 for all positive integers m,n. If f(10) can take k distinct values, find k.",
    "Let f: N → N satisfy f(f(n)) + f(n+1) = n + 2 for all n ≥ 0. Find f(2024) mod 10^5.",
    
    # Combinatorics
    "Let a_n be the number of ways to tile a 3×n rectangle with 1×1 and 1×2 tiles. Find a_{1000} mod 10^5.",
    "How many permutations σ of {1,...,20} satisfy σ(σ(i)) = i for all i and have exactly 6 fixed points?",
    "Find the number of sequences (a_1, ..., a_{10}) of non-negative integers with a_1 + a_2 + ... + a_{10} = 30 and a_i ≤ a_{i+1} + 3 for all i. Give answer mod 10^5.",
]


def generate_problem(client, category_info, problem_index):
    """Generate a novel problem in the given category."""
    prompt = f"""{FEW_SHOT_EXAMPLE}

Now, generate problem #{problem_index} in the category: {category_info['description']}

{category_info['prompt']}

IMPORTANT:
- The problem must be ORIGINAL (not a well-known problem)
- Include the full problem statement
- The answer must be a specific non-negative integer
- State the answer clearly at the end

Format:
PROBLEM: [full problem statement]
ANSWER: [integer]"""

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": "You are an expert mathematical olympiad problem setter. Create novel, challenging problems."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.9,  # Higher temp for diversity in problem generation
            max_tokens=2048,
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"  Error generating problem: {e}")
        return None


def solve_problem(client, problem_text):
    """Solve a problem using DeepSeek V3.1-Terminus with AIMO3-style reasoning."""
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT_SOLVER},
                {"role": "user", "content": problem_text},
            ],
            temperature=TEMPERATURE,
            max_tokens=8192,  # Long CoT for hard problems
            top_p=0.95,
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"  Error solving: {e}")
        return None


def extract_answer(text):
    """Extract integer answer from response."""
    if not text:
        return None
    patterns = [
        r"The answer is:\s*(\-?\d+)",
        r"The answer is\s*(\-?\d+)",
        r"\\boxed\{(\-?\d+)\}",
        r"ANSWER:\s*(\-?\d+)",
        r"answer we report is\s*(\-?\d+)",
        r"remainder.*?is\s+(\d+)",
        r"≡\s*(\d+)\s*\(mod",
        r"= (\d+)\s*$",
    ]
    for pattern in patterns:
        matches = re.findall(pattern, text, re.IGNORECASE | re.MULTILINE)
        if matches:
            try:
                return int(matches[-1])
            except ValueError:
                continue
    return None


def format_training_example(problem, solution, answer):
    """Format for Unsloth SFT training with GPT-OSS harmony-compatible format."""
    
    # Extract thinking if present
    thinking = ""
    if "<think>" in solution and "</think>" in solution:
        thinking = solution.split("<think>")[1].split("</think>")[0].strip()
    
    return {
        "conversations": [
            {
                "role": "system",
                "content": (
                    "You are a world-class mathematician competing in the AI Mathematical Olympiad. "
                    "Solve problems with rigorous step-by-step reasoning. "
                    "Use named theorems (LTE, Legendre's formula, Hermite's identity, etc.) when applicable. "
                    "When dealing with large numbers, simplify using Fermat-Euler or other algebraic methods. "
                    "Write Python code to verify computations when helpful. "
                    "Give your final answer as a single non-negative integer."
                ),
            },
            {
                "role": "user",
                "content": f"Solve this math competition problem:\n\n{problem}",
            },
            {
                "role": "assistant",
                "content": solution,
            },
        ],
        "problem": problem,
        "answer": str(answer) if answer is not None else "",
        "thinking": thinking,
    }


def process_reference_problems(client):
    """Generate high-quality solutions for the AIMO3 reference problems."""
    print("\n=== Processing AIMO3 Reference Problems ===")
    examples = []
    
    for ref in AIMO3_REFERENCE_PROBLEMS:
        print(f"\nSolving {ref['id']}: {ref['problem'][:80]}...")
        
        best_solution = None
        for attempt in range(NUM_SAMPLES_PER_PROBLEM):
            solution = solve_problem(client, ref["problem"])
            if solution:
                answer = extract_answer(solution)
                if answer == ref["answer"]:
                    best_solution = solution
                    print(f"  Attempt {attempt+1}: CORRECT ({answer})")
                    break
                else:
                    print(f"  Attempt {attempt+1}: got {answer}, expected {ref['answer']}")
            time.sleep(1)
        
        if best_solution:
            examples.append(format_training_example(
                ref["problem"], best_solution, ref["answer"]
            ))
        else:
            print(f"  WARNING: Could not get correct answer for {ref['id']}")
    
    return examples


def process_curated_problems(client):
    """Solve the curated hard problems."""
    print("\n=== Processing Curated Hard Problems ===")
    examples = []
    
    for i, problem in enumerate(CURATED_HARD_PROBLEMS):
        print(f"\n[{i+1}/{len(CURATED_HARD_PROBLEMS)}] {problem[:80]}...")
        
        answers = []
        solutions = []
        
        for attempt in range(NUM_SAMPLES_PER_PROBLEM):
            solution = solve_problem(client, problem)
            if solution:
                answer = extract_answer(solution)
                answers.append(answer)
                solutions.append(solution)
                print(f"  Attempt {attempt+1}: {answer}")
            time.sleep(0.5)
        
        # Majority vote
        valid = [a for a in answers if a is not None]
        if valid:
            best = Counter(valid).most_common(1)[0][0]
            for sol, ans in zip(solutions, answers):
                if ans == best:
                    examples.append(format_training_example(problem, sol, best))
                    break
        
        time.sleep(0.5)
    
    return examples


def generate_category_problems(client, category_name, category_info):
    """Generate and solve problems for a given category."""
    print(f"\n=== Generating {category_info['description']} ({category_info['count']} problems) ===")
    examples = []
    
    for i in range(category_info["count"]):
        # Generate a novel problem
        print(f"\n[{i+1}/{category_info['count']}] Generating problem...")
        generated = generate_problem(client, category_info, i + 1)
        
        if not generated:
            continue
        
        # Extract problem statement
        problem_match = re.search(r"PROBLEM:\s*(.*?)(?=ANSWER:|$)", generated, re.DOTALL)
        answer_match = re.search(r"ANSWER:\s*(\d+)", generated)
        
        if not problem_match:
            print("  Could not parse generated problem")
            continue
        
        problem_text = problem_match.group(1).strip()
        expected_answer = int(answer_match.group(1)) if answer_match else None
        
        print(f"  Problem: {problem_text[:80]}...")
        if expected_answer:
            print(f"  Expected answer: {expected_answer}")
        
        # Solve it with V3.1-Terminus
        answers = []
        solutions = []
        
        for attempt in range(NUM_SAMPLES_PER_PROBLEM):
            solution = solve_problem(client, problem_text)
            if solution:
                answer = extract_answer(solution)
                answers.append(answer)
                solutions.append(solution)
            time.sleep(0.5)
        
        # Pick best answer (prefer matching expected if available)
        valid = [a for a in answers if a is not None]
        if not valid:
            print("  No valid answers extracted")
            continue
        
        best = Counter(valid).most_common(1)[0][0]
        
        # If we have expected answer, prefer solutions that match
        if expected_answer is not None and expected_answer in valid:
            best = expected_answer
        
        for sol, ans in zip(solutions, answers):
            if ans == best:
                examples.append(format_training_example(problem_text, sol, best))
                break
        
        if (i + 1) % 10 == 0:
            print(f"  Category progress: {i+1}/{category_info['count']}")
        
        time.sleep(1)  # Rate limiting
    
    return examples


def load_external_datasets():
    """
    Load problems from HuggingFace datasets, filtered for AIMO3-relevant difficulty.
    
    Priority datasets:
    1. AI-MO/NuminaMath-CoT - filter for IMO/Putnam/USAMO sources
    2. MATH dataset - Level 5 problems only
    3. AIME problems (2000-2024)
    """
    problems = []
    
    try:
        from datasets import load_dataset
        
        # NuminaMath - filter for hardest problems
        print("Loading NuminaMath...")
        ds = load_dataset("AI-MO/NuminaMath-CoT", split="train")
        
        hard_sources = ["imo_shortlist", "imo", "usamo", "putnam", "china_national", 
                       "balkan", "iran", "vietnam", "korean", "japan", "apmo"]
        
        for item in ds:
            source = item.get("source", "").lower()
            if any(s in source for s in hard_sources):
                problems.append({
                    "problem": item["problem"],
                    "solution": item.get("solution", ""),
                    "source": source,
                })
        
        print(f"Loaded {len(problems)} hard problems from NuminaMath")
        
        # Also load MATH Level 5
        try:
            math_ds = load_dataset("lighteval/MATH", "all", split="test")
            for item in math_ds:
                if item.get("level") == "Level 5":
                    problems.append({
                        "problem": item["problem"],
                        "solution": item.get("solution", ""),
                        "source": "MATH_Level5",
                    })
            print(f"Total with MATH Level 5: {len(problems)} problems")
        except:
            pass
            
    except Exception as e:
        print(f"Could not load external datasets: {e}")
    
    return problems


def main():
    print("=" * 70)
    print("AIMO3-Targeted Training Data Generator (v2)")
    print("Using DeepSeek V3.1-Terminus API")
    print("=" * 70)
    
    client = OpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)
    
    all_examples = []
    
    # Phase 1: Reference problems (guaranteed high quality)
    ref_examples = process_reference_problems(client)
    all_examples.extend(ref_examples)
    print(f"\nPhase 1 complete: {len(ref_examples)} reference problem solutions")
    
    # Phase 2: Curated hard problems
    curated_examples = process_curated_problems(client)
    all_examples.extend(curated_examples)
    print(f"\nPhase 2 complete: {len(curated_examples)} curated problem solutions")
    
    # Phase 3: Generated problems by category
    for cat_name, cat_info in PROBLEM_GENERATION_PROMPTS.items():
        cat_examples = generate_category_problems(client, cat_name, cat_info)
        all_examples.extend(cat_examples)
        print(f"\nCategory '{cat_name}': {len(cat_examples)} examples")
        
        # Save progress after each category
        with open(OUTPUT_FILE, "w") as f:
            for ex in all_examples:
                f.write(json.dumps(ex) + "\n")
        print(f"Progress saved: {len(all_examples)} total examples")
    
    # Phase 4: External dataset problems (re-solved by V3.1-Terminus)
    external = load_external_datasets()
    if external:
        print(f"\n=== Processing {min(200, len(external))} external hard problems ===")
        random.shuffle(external)
        for i, ext in enumerate(external[:200]):
            solution = solve_problem(client, ext["problem"])
            if solution:
                answer = extract_answer(solution)
                if answer is not None:
                    all_examples.append(format_training_example(
                        ext["problem"], solution, answer
                    ))
            if (i + 1) % 20 == 0:
                print(f"  External progress: {i+1}/200")
            time.sleep(0.5)
    
    # Final save
    with open(OUTPUT_FILE, "w") as f:
        for ex in all_examples:
            f.write(json.dumps(ex) + "\n")
    
    print(f"\n{'=' * 70}")
    print(f"DONE! Generated {len(all_examples)} training examples")
    print(f"Saved to: {OUTPUT_FILE}")
    print(f"{'=' * 70}")
    
    # Summary by source
    print("\nBreakdown:")
    print(f"  Reference problems: {len(ref_examples)}")
    print(f"  Curated hard: {len(curated_examples)}")
    generated = len(all_examples) - len(ref_examples) - len(curated_examples)
    print(f"  Generated + external: {generated}")
    
    print(f"\nNext: Upload {OUTPUT_FILE} to Kaggle and run step2_finetune_gpt_oss.ipynb")


if __name__ == "__main__":
    main()
