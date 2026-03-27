#!/usr/bin/env python3
"""Generate synthetic training data for prompt complexity classifier bands 0.3, 0.4, 0.5."""

import json
import random
import sys

random.seed(42)

# ============================================================
# BAND 0.3 — MODERATE EASY
# Explain concepts with examples, write simple functions,
# compare two things, basic debugging hints
# 70% single-turn, 30% multi-turn (2-3 turns)
# ============================================================

BAND_03_SYSTEM_PROMPTS = [
    "You are a helpful programming assistant.",
    "You are a software development tutor who explains concepts clearly.",
    "You are an experienced developer helping junior engineers.",
    "You are a coding mentor focused on web development.",
    "You are a patient teacher who explains programming concepts with examples.",
    "You are a backend developer helping with common programming questions.",
    "You are a technical assistant specializing in beginner-friendly explanations.",
    "You help developers understand fundamental programming concepts.",
    "You are an assistant that explains code concepts simply and clearly.",
    "You are a developer advocate who makes technical topics accessible.",
    "You are a friendly coding tutor.",
    "You assist with basic programming tasks and explanations.",
    "You are a knowledgeable assistant for software development questions.",
    "You explain programming concepts using real-world analogies.",
    "You are a helpful assistant for web development beginners.",
]

BAND_03_SINGLE_TURN = [
    "Explain the difference between let and const in JavaScript.",
    "Write a function to reverse a string in Python.",
    "What's the difference between SQL and NoSQL databases?",
    "Explain what a REST API is in simple terms.",
    "Write a function that checks if a number is even or odd.",
    "What's the difference between == and === in JavaScript?",
    "Explain what an array is and give an example.",
    "Write a function to find the maximum value in a list.",
    "What's the difference between GET and POST HTTP methods?",
    "Explain what a for loop does with a simple example.",
    "Write a function to count vowels in a string.",
    "What's the difference between a class and an object?",
    "Explain what JSON is and why it's used.",
    "Write a function to calculate the factorial of a number.",
    "What is the difference between margin and padding in CSS?",
    "Explain what a callback function is in JavaScript.",
    "Write a function to check if a string is a palindrome.",
    "What's the difference between an interface and a type in TypeScript?",
    "Explain what HTTP status codes 200, 404, and 500 mean.",
    "Write a function to remove duplicates from an array.",
    "What is the difference between null and undefined in JavaScript?",
    "Explain how CSS flexbox works with a simple example.",
    "Write a function that converts Celsius to Fahrenheit.",
    "What's the difference between a stack and a queue?",
    "Explain what version control is and why we use Git.",
    "Write a function to sort an array of numbers in ascending order.",
    "What is the difference between synchronous and asynchronous code?",
    "Explain what a primary key is in a database.",
    "Write a function to merge two sorted arrays.",
    "What's the difference between cookies and localStorage?",
    "Explain what DNS is in simple terms.",
    "Write a function to capitalize the first letter of each word in a string.",
    "What is the difference between TCP and UDP?",
    "Explain what a foreign key is in a relational database.",
    "Write a function that generates the Fibonacci sequence up to n terms.",
    "What's the difference between a compiler and an interpreter?",
    "Explain what the DOM is in web development.",
    "Write a function to flatten a nested array one level deep.",
    "What is the difference between a process and a thread?",
    "Explain what an environment variable is.",
    "Write a function to check if two strings are anagrams.",
    "What's the difference between HTTP and HTTPS?",
    "Explain what a linked list is with an example.",
    "Write a function to convert a string to title case.",
    "What is the difference between abstract classes and interfaces?",
    "Explain what a hash map is and when to use it.",
    "Write a function that returns the nth element of the Fibonacci sequence.",
    "What's the difference between a monolith and microservices?",
    "Explain what a Docker container is in simple terms.",
    "Write a function to find all prime numbers up to n.",
    "What is the difference between var, let, and const?",
    "Explain what middleware is in Express.js.",
    "Write a function to deep clone an object in JavaScript.",
    "What's the difference between relative and absolute positioning in CSS?",
    "Explain what a promise is in JavaScript.",
    "Write a function to rotate an array by k positions.",
    "What is the difference between SQL JOIN types?",
    "Explain what an API endpoint is.",
    "Write a function to convert a number to its binary representation.",
    "What's the difference between authentication and authorization?",
    "Explain what a virtual DOM is in React.",
    "Write a function to find the intersection of two arrays.",
    "What is the difference between a set and an array?",
    "Explain what CORS is and why it exists.",
    "Write a function to truncate a string to a given length with ellipsis.",
    "What's the difference between git merge and git rebase?",
    "Explain what a CDN is and why it's useful.",
    "Write a function to group array elements by a property.",
    "What is the difference between PUT and PATCH HTTP methods?",
    "Explain what a queue data structure is.",
    "Write a function to debounce another function.",
    "What's the difference between unit tests and integration tests?",
    "Explain what event delegation is in JavaScript.",
    "Write a function to find the second largest number in an array.",
    "What is the difference between server-side and client-side rendering?",
    "Explain what a binary search tree is.",
    "Write a function that implements bubble sort.",
    "What's the difference between CSS grid and flexbox?",
    "Explain what a webhook is.",
    "Write a function to check if a number is a power of two.",
    "What is the difference between localStorage and sessionStorage?",
    "Explain what a singleton pattern is.",
    "Write a function that pads a string to a specified length.",
    "What's the difference between npm and yarn?",
    "Explain what a regular expression is with a simple example.",
    "Write a function to convert an object to query string parameters.",
    "What is the difference between mutable and immutable data?",
    "Explain what a semaphore is in simple terms.",
    "Write a function to chunk an array into groups of a given size.",
    "What's the difference between float and flexbox in CSS?",
    "Explain what a CI/CD pipeline is.",
    "Write a function to calculate the sum of digits of a number.",
    "What is the difference between a library and a framework?",
    "Explain what the event loop is in Node.js.",
    "Write a function to zip two arrays together.",
    "What's the difference between static and dynamic typing?",
    "Explain what a load balancer does.",
    "Write a function to find the longest word in a sentence.",
    "What is the difference between block and inline elements in HTML?",
    "Explain what a race condition is.",
    "Write a function to generate a random string of given length.",
    "What's the difference between composition and inheritance?",
    "Explain what GraphQL is and how it differs from REST.",
    "Write a function to remove falsy values from an array.",
    "What is the difference between an index and a table scan in databases?",
    "Explain what a proxy server is.",
    "Write a function to compute the greatest common divisor of two numbers.",
    "What's the difference between a 301 and 302 redirect?",
    "Explain what a microservice is.",
    "Write a function to convert snake_case to camelCase.",
    "What is the difference between optimistic and pessimistic locking?",
    "Explain what a JWT token is.",
    "Write a function to check if brackets in a string are balanced.",
    "What's the difference between SOAP and REST?",
    "Explain what the 'this' keyword refers to in JavaScript.",
    "Write a function to implement a simple stack using an array.",
    "What is the difference between a left join and an inner join?",
    "Explain what a memory leak is.",
    "Write a function to count the frequency of each character in a string.",
    "What's the difference between horizontal and vertical scaling?",
    "Explain what an ORM is.",
    "Write a function to check if a number is an Armstrong number.",
    "What is the difference between a URI and a URL?",
    "Explain what hoisting is in JavaScript.",
    "Write a function to implement binary search on a sorted array.",
    "What's the difference between a shallow copy and a deep copy?",
    "Explain what a cron job is.",
    "Write a function to transpose a 2D matrix.",
    "Explain what a garbage collector does.",
    "Write a function to find the missing number in a sequence from 1 to n.",
    "What's the difference between functional and object-oriented programming?",
    "Explain what a deadlock is in computing.",
    "Write a function that implements insertion sort.",
    "What is the difference between a view and a table in SQL?",
    "Explain what SSH is and what it's used for.",
    "Write a function to flatten a deeply nested array.",
    "What's the difference between a map and a filter in JavaScript?",
    "Explain what ACID properties are in databases.",
    "Write a function that returns the union of two arrays.",
    "What is the difference between IPv4 and IPv6?",
    "Explain what a service worker is.",
    "Write a function to find duplicate values in an array.",
    "What's the difference between a mutex and a semaphore?",
]

BAND_03_MULTI_TURN_TEMPLATES = [
    {
        "turns": [
            {"role": "user", "content": "What's the difference between let and const in JavaScript?"},
            {"role": "assistant", "content": "The main difference is mutability. `let` allows you to reassign values, while `const` creates a read-only reference that cannot be reassigned after initialization. However, `const` objects and arrays can still have their contents modified."},
            {"role": "user", "content": "So can I change a property of a const object?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "Can you explain what a closure is in JavaScript?"},
            {"role": "assistant", "content": "A closure is a function that has access to variables from its outer (enclosing) scope, even after the outer function has returned. It 'closes over' those variables."},
            {"role": "user", "content": "Can you give me a simple example?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "What is a hash table?"},
            {"role": "assistant", "content": "A hash table is a data structure that stores key-value pairs. It uses a hash function to compute an index into an array of buckets, from which the desired value can be found. This gives O(1) average time complexity for lookups."},
            {"role": "user", "content": "What happens when two keys hash to the same index?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "What does the map function do in JavaScript?"},
            {"role": "assistant", "content": "The `map()` method creates a new array by calling a provided function on every element in the calling array. It doesn't modify the original array."},
            {"role": "user", "content": "How is it different from forEach?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "Can you explain what promises are in JavaScript?"},
            {"role": "assistant", "content": "A Promise is an object representing the eventual completion or failure of an asynchronous operation. It can be in one of three states: pending, fulfilled, or rejected."},
            {"role": "user", "content": "How do I chain multiple promises together?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "What is CSS specificity?"},
            {"role": "assistant", "content": "CSS specificity is the algorithm browsers use to determine which CSS rule applies when multiple rules target the same element. Inline styles have the highest specificity, followed by IDs, then classes/attributes, then element selectors."},
            {"role": "user", "content": "Where does !important fit in?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "What's the difference between a stack and a queue?"},
            {"role": "assistant", "content": "A stack follows Last-In-First-Out (LIFO) — the last element added is the first removed. A queue follows First-In-First-Out (FIFO) — the first element added is the first removed."},
            {"role": "user", "content": "When would I use a stack instead of a queue?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "Explain what a database index is."},
            {"role": "assistant", "content": "A database index is a data structure that improves the speed of data retrieval operations on a table, similar to an index in a book. It allows the database to find rows without scanning the entire table."},
            {"role": "user", "content": "Can having too many indexes be a bad thing?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "What is an arrow function in JavaScript?"},
            {"role": "assistant", "content": "Arrow functions are a shorter syntax for writing function expressions. They use the => syntax and don't have their own `this`, `arguments`, `super`, or `new.target` bindings."},
            {"role": "user", "content": "When should I avoid using arrow functions?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "What does npm install do?"},
            {"role": "assistant", "content": "npm install reads the package.json file and downloads all the listed dependencies into a node_modules folder. It also generates or updates a package-lock.json file to lock dependency versions."},
            {"role": "user", "content": "What's the difference between dependencies and devDependencies?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "What is a try-catch block?"},
            {"role": "assistant", "content": "A try-catch block is used for error handling. Code that might throw an error goes in the `try` block, and the `catch` block handles the error if one occurs."},
            {"role": "user", "content": "Is there a way to run code regardless of whether an error occurred?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "What is a function parameter vs an argument?"},
            {"role": "assistant", "content": "Parameters are the variable names listed in a function's definition. Arguments are the actual values passed to the function when it's called."},
            {"role": "user", "content": "What are default parameters?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "What is the box model in CSS?"},
            {"role": "assistant", "content": "The CSS box model describes the rectangular boxes generated for elements. It consists of content, padding, border, and margin, from innermost to outermost."},
            {"role": "user", "content": "What does box-sizing: border-box do?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "What does the spread operator do in JavaScript?"},
            {"role": "assistant", "content": "The spread operator (...) expands an iterable (like an array) into individual elements. It can be used to copy arrays, merge arrays, or pass array elements as function arguments."},
            {"role": "user", "content": "How is the rest operator different from spread?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "Explain what destructuring is in JavaScript."},
            {"role": "assistant", "content": "Destructuring is a syntax that lets you unpack values from arrays or properties from objects into distinct variables. For example: `const {name, age} = person;`"},
            {"role": "user", "content": "Can you destructure nested objects too?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "What is a Python list comprehension?"},
            {"role": "assistant", "content": "A list comprehension is a concise way to create lists. It consists of an expression followed by a for clause and optional if clauses: `[x**2 for x in range(10)]`."},
            {"role": "user", "content": "Can I use conditions in list comprehensions?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "What is the difference between a GET and POST request?"},
            {"role": "assistant", "content": "GET requests data from a server and sends parameters in the URL. POST submits data to a server in the request body. GET is idempotent and cacheable; POST is not."},
            {"role": "user", "content": "When should I use PUT vs POST?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "What is the virtual DOM?"},
            {"role": "assistant", "content": "The virtual DOM is a lightweight JavaScript representation of the real DOM. React uses it to compute the minimal set of changes needed, then batches updates to the real DOM for better performance."},
            {"role": "user", "content": "Does Vue also use a virtual DOM?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "What does git rebase do?"},
            {"role": "assistant", "content": "Git rebase moves or combines a sequence of commits to a new base commit. It replays your changes on top of another branch, resulting in a linear commit history."},
            {"role": "user", "content": "When should I use rebase vs merge?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "What is a foreign key in SQL?"},
            {"role": "assistant", "content": "A foreign key is a column (or set of columns) in one table that references the primary key of another table. It establishes a relationship between the two tables and enforces referential integrity."},
            {"role": "user", "content": "Can a table have multiple foreign keys?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "Explain what recursion is."},
            {"role": "assistant", "content": "Recursion is when a function calls itself to solve a problem by breaking it into smaller subproblems. Every recursive function needs a base case to stop the recursion."},
            {"role": "user", "content": "What happens if I forget the base case?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "What is a Python dictionary?"},
            {"role": "assistant", "content": "A dictionary is a collection of key-value pairs. Keys must be unique and immutable (strings, numbers, tuples). You access values by their key rather than by index."},
            {"role": "user", "content": "How do I iterate over both keys and values?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "What does the reduce function do?"},
            {"role": "assistant", "content": "The reduce function processes an array from left to right, applying a callback function that accumulates a single result. It takes an accumulator and the current element as arguments."},
            {"role": "user", "content": "Can you show a simple example of summing numbers with reduce?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "What is TypeScript?"},
            {"role": "assistant", "content": "TypeScript is a superset of JavaScript that adds static type checking. It compiles to plain JavaScript and catches type errors at compile time rather than runtime."},
            {"role": "user", "content": "Do I need TypeScript for small projects?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "What is a Docker image vs a Docker container?"},
            {"role": "assistant", "content": "A Docker image is a read-only template with instructions for creating a container. A container is a runnable instance of an image — you can start, stop, and delete containers while the image remains unchanged."},
            {"role": "user", "content": "Can multiple containers run from the same image?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "What are template literals in JavaScript?"},
            {"role": "assistant", "content": "Template literals use backticks (`) instead of quotes and allow embedded expressions with ${expression} syntax. They also support multi-line strings without escape characters."},
            {"role": "user", "content": "Can I use functions inside template literals?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "Explain what middleware is in Express."},
            {"role": "assistant", "content": "Middleware functions are functions that have access to the request object, response object, and the next middleware function in the request-response cycle. They can execute code, modify the request/response, or end the cycle."},
            {"role": "user", "content": "What's the difference between app-level and router-level middleware?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "What is a Python generator?"},
            {"role": "assistant", "content": "A generator is a function that returns an iterator using the `yield` keyword instead of `return`. It generates values lazily, one at a time, which is memory-efficient for large datasets."},
            {"role": "user", "content": "How is yield different from return?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "What is a SQL JOIN?"},
            {"role": "assistant", "content": "A JOIN clause combines rows from two or more tables based on a related column. The most common types are INNER JOIN, LEFT JOIN, RIGHT JOIN, and FULL OUTER JOIN."},
            {"role": "user", "content": "What happens if there's no matching row in a LEFT JOIN?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "What is responsive design?"},
            {"role": "assistant", "content": "Responsive design is an approach to web design that makes web pages render well on a variety of devices and screen sizes. It uses flexible layouts, images, and CSS media queries."},
            {"role": "user", "content": "What's the difference between responsive and adaptive design?"},
        ]
    },
]

# ============================================================
# BAND 0.4 — MODERATE
# Write functions with error handling, explain tradeoffs,
# basic code review, multi-step instructions
# 60% single-turn, 40% multi-turn (2-3 turns)
# ============================================================

BAND_04_SYSTEM_PROMPTS = [
    "You are an experienced software engineer who writes production-quality code.",
    "You are a code reviewer who identifies bugs and suggests improvements.",
    "You are a senior developer who explains tradeoffs in software design.",
    "You are a backend engineer specializing in API development.",
    "You help developers write robust code with proper error handling.",
    "You are a full-stack developer with expertise in modern web technologies.",
    "You are a database specialist who optimizes queries and schemas.",
    "You are a DevOps engineer who helps with deployment and infrastructure.",
    "You are a tech lead who reviews code and mentors developers.",
    "You are an architect who explains design decisions and tradeoffs.",
    "You are a security-conscious developer who writes safe code.",
    "You are a testing specialist who helps write comprehensive tests.",
    "You help teams improve their code quality and development practices.",
    "You are a Node.js expert who builds reliable backend services.",
    "You are a Python developer focused on clean, maintainable code.",
]

BAND_04_SINGLE_TURN = [
    "Write a function to validate email addresses with proper error handling.",
    "Explain async/await in JavaScript with examples showing error handling.",
    "Review this code for bugs: `function divide(a, b) { return a / b; }`",
    "Write a TypeScript function to parse a CSV string into an array of objects.",
    "Explain the tradeoffs between SQL and NoSQL for a user profiles database.",
    "Write a function that retries a failed HTTP request up to 3 times.",
    "Explain how to properly handle errors in Express.js middleware.",
    "Write a function to validate a credit card number using the Luhn algorithm.",
    "Explain the tradeoffs of using JWT vs session-based authentication.",
    "Write a function to sanitize HTML input to prevent XSS attacks.",
    "Explain how database transactions work and when to use them.",
    "Write a function that implements a simple rate limiter.",
    "Explain the differences between REST and GraphQL with their tradeoffs.",
    "Write a function to validate and parse a URL with error handling.",
    "Explain the tradeoffs of using a relational database vs a document store.",
    "Write a middleware function that logs request details and response times.",
    "Explain how to implement pagination in a REST API with examples.",
    "Write a function that validates a JSON schema against input data.",
    "Explain the tradeoffs between monorepo and multi-repo architectures.",
    "Write a TypeScript function that safely parses JSON with error handling.",
    "Explain how connection pooling works in database drivers.",
    "Write a function to generate a unique slug from a title string.",
    "Explain the tradeoffs between eager loading and lazy loading in ORMs.",
    "Write a function that implements a simple pub/sub event emitter.",
    "Explain how CORS works and how to configure it properly.",
    "Write a function to validate a password meets complexity requirements.",
    "Explain the tradeoffs of using WebSockets vs Server-Sent Events.",
    "Write a function that merges two objects deeply with conflict resolution.",
    "Explain how database indexing works and its impact on write performance.",
    "Write a function that implements a basic LRU cache.",
    "Explain the pros and cons of microservices vs monolithic architecture.",
    "Write a function to detect and handle circular references in JSON.",
    "Explain how to implement proper logging in a Node.js application.",
    "Write a function that converts between different date formats safely.",
    "Explain the tradeoffs between polling and long-polling for real-time updates.",
    "Write a TypeScript function to validate API request parameters.",
    "Explain how to implement idempotent API endpoints.",
    "Write a function that handles file uploads with size and type validation.",
    "Explain the tradeoffs of using Redis for caching vs in-memory caching.",
    "Write a function that implements debounce with a cancel method.",
    "Explain how to properly handle database migrations in production.",
    "Write a function to parse and validate environment variables on startup.",
    "Explain the tradeoffs of server-side rendering vs client-side rendering.",
    "Write a function that creates a timeout wrapper for any async operation.",
    "Explain how to implement graceful shutdown in a Node.js server.",
    "Write a function to validate and normalize phone numbers.",
    "Explain the tradeoffs between optimistic and pessimistic concurrency control.",
    "Write a function that implements a circuit breaker pattern.",
    "Explain how to properly handle file I/O errors in Node.js.",
    "Write a function to batch database inserts for better performance.",
    "Explain the tradeoffs of using UUIDs vs auto-increment IDs as primary keys.",
    "Write a function to safely access nested object properties.",
    "Explain how content negotiation works in HTTP APIs.",
    "Write a middleware that validates API keys from request headers.",
    "Explain the tradeoffs between horizontal and vertical scaling.",
    "Write a function that implements exponential backoff with jitter.",
    "Explain how to implement proper error boundaries in React.",
    "Write a function to compress and decompress strings using gzip in Node.js.",
    "Explain the tradeoffs of using message queues vs direct API calls.",
    "Write a function that validates and escapes SQL query parameters.",
    "Explain how to implement blue-green deployments.",
    "Write a function to handle concurrent API requests with a max limit.",
    "Explain the tradeoffs of using TypeScript strict mode.",
    "Write a function that implements a simple middleware pipeline.",
    "Explain how to properly implement caching headers in HTTP responses.",
    "Write a function to validate webhook signatures for security.",
    "Explain the tradeoffs of storing files in S3 vs in the database.",
    "Write a function that retries with different strategies (linear, exponential).",
    "Explain how to implement feature flags in a web application.",
    "Write a function to parse and validate ISO 8601 date strings.",
    "Explain the tradeoffs of using a CDN for static assets.",
    "Write a function that implements a simple task queue with priorities.",
    "Explain how to implement proper input validation in a REST API.",
    "Write a function to generate and verify HMAC signatures.",
    "Explain the tradeoffs of using cookies vs tokens for authentication.",
    "Write a function that handles paginated API responses with cursors.",
    "Explain how to implement proper secrets management.",
    "Write a function that validates form data with detailed error messages.",
    "Explain the tradeoffs between using an ORM vs raw SQL queries.",
    "Write a function to implement a simple health check endpoint.",
    "Explain how to properly handle timezone conversions in JavaScript.",
    "Write a function that implements a simple semaphore in JavaScript.",
    "Explain the tradeoffs between pull-based and push-based data fetching.",
    "Write a function to safely execute shell commands from Node.js.",
    "Explain how to implement role-based access control (RBAC).",
    "Write a function that converts errors to user-friendly messages.",
    "Explain the tradeoffs of using GraphQL subscriptions vs WebSockets.",
    "Write a function to validate and process multipart form data.",
    "Explain how to implement proper API versioning.",
    "Write a function that monitors and reports memory usage.",
    "Explain the tradeoffs of using a reverse proxy vs direct server access.",
    "Write a function to handle graceful degradation when a service is unavailable.",
    "Explain how to implement request deduplication.",
    "Write a function that validates configuration files on startup.",
    "Explain the tradeoffs between event sourcing and traditional CRUD.",
    "Write a function to implement a simple connection pool.",
    "Explain how to implement proper CSRF protection.",
    "Write a function that handles concurrent writes with optimistic locking.",
    "Explain the tradeoffs of using a binary protocol vs JSON for APIs.",
    "Write a function to detect and prevent SQL injection attempts.",
    "Explain how to implement proper health checks for microservices.",
    "Write a function that handles streaming large files efficiently.",
    "Explain the tradeoffs of using container orchestration vs simple deployments.",
    "Write a function to implement a simple retry queue with dead letter support.",
    "Explain how API gateways work and their tradeoffs.",
    "Write a function to validate and parse command-line arguments.",
    "Explain the tradeoffs of using server-side caching vs client-side caching.",
    "Write a function to implement a basic request/response logger.",
    "Explain how to implement database connection failover.",
    "Write a function that handles API rate limit responses with retry-after headers.",
    "Explain the tradeoffs between eventual consistency and strong consistency.",
    "Write a function to safely merge configurations from multiple sources.",
    "Explain how to implement canary deployments.",
    "Write a function that validates file paths to prevent directory traversal.",
    "Explain the tradeoffs of using a service mesh.",
    "Write a function to implement simple A/B testing logic.",
    "Explain how to properly handle large JSON payloads in Node.js.",
    "Write a function to validate and sanitize user input for a search feature.",
    "Explain the tradeoffs of using WebAssembly in web applications.",
    "Write a function that implements a simple state machine.",
    "Explain how to implement proper audit logging.",
    "Write a function to handle database deadlock retries.",
    "Explain the tradeoffs of using gRPC vs REST.",
    "Write a function to parse structured log entries.",
    "Explain how to implement proper request tracing across services.",
    "Write a function that validates API responses against a schema.",
    "Explain the tradeoffs between using a monorepo tool like Turborepo vs Nx.",
    "Write a function to implement basic IP-based rate limiting.",
    "Explain how to implement distributed locking.",
    "Write a function that safely processes user-uploaded CSV files.",
    "Explain the tradeoffs of using a separate read replica for queries.",
    "Write a function to implement sliding window rate limiting.",
    "Explain how to properly implement API key rotation.",
    "Write a function that monitors event loop lag in Node.js.",
    "Explain the tradeoffs of using Lambda/serverless vs always-on servers.",
    "Write a function to implement a simple bloom filter.",
    "Explain how to implement proper backup and restore procedures.",
    "Write a function that handles WebSocket reconnection with backoff.",
    "Explain the tradeoffs of using edge computing for API responses.",
    "Write a function to validate Stripe webhook events.",
    "Explain how to implement proper data masking for logs.",
    "Write a function that implements a simple queue using two stacks.",
    "Explain the tradeoffs between synchronous and asynchronous processing.",
]

BAND_04_MULTI_TURN_TEMPLATES = [
    {
        "turns": [
            {"role": "user", "content": "I need to validate email addresses in my Node.js API. What's the best approach?"},
            {"role": "assistant", "content": "For production use, I recommend using a well-tested library like `validator.js` or `zod` for schema validation. A regex-only approach misses many edge cases. You should validate both format and optionally verify the domain with DNS MX record lookup."},
            {"role": "user", "content": "Can you write a validation function that checks format and gives specific error messages?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "How should I handle errors in my Express API?"},
            {"role": "assistant", "content": "Use a centralized error-handling middleware. Create custom error classes with status codes, and ensure async errors are caught with try-catch or an async wrapper. Never expose internal error details to clients."},
            {"role": "user", "content": "Show me how to implement the centralized error handler middleware."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "I'm choosing between PostgreSQL and MongoDB for my e-commerce app. What should I consider?"},
            {"role": "assistant", "content": "PostgreSQL is better for structured data with relationships (orders, products, users) and ACID transactions. MongoDB is better for flexible schemas and when your data model is mostly reads. For e-commerce with payments and inventory, I'd lean toward PostgreSQL."},
            {"role": "user", "content": "What if I need full-text search on product descriptions?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "How do I implement rate limiting in my API?"},
            {"role": "assistant", "content": "There are several algorithms: fixed window, sliding window, token bucket, and leaky bucket. For most APIs, a sliding window counter using Redis is a good balance of accuracy and performance."},
            {"role": "user", "content": "Write a middleware that implements token bucket rate limiting with Redis."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "I'm seeing memory leaks in my Node.js application. How should I debug this?"},
            {"role": "assistant", "content": "Start by taking heap snapshots using Node's --inspect flag and Chrome DevTools. Common causes include event listeners not being removed, closures holding large objects, and unbounded caches. You can also use `process.memoryUsage()` to monitor trends."},
            {"role": "user", "content": "Write a utility function that monitors memory and logs warnings when usage exceeds a threshold."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "Should I use JWT or session cookies for my web app authentication?"},
            {"role": "assistant", "content": "Sessions with cookies are simpler, more secure by default (httpOnly, secure flags), and support easy revocation. JWTs are better for stateless APIs and microservices. For a web app with a single backend, session cookies are usually the better choice."},
            {"role": "user", "content": "How do I implement secure session management with Express?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "My database queries are getting slow as data grows. What should I look at?"},
            {"role": "assistant", "content": "Start with EXPLAIN ANALYZE on your slow queries to check for sequential scans. Look at missing indexes, N+1 queries, and queries that fetch more data than needed. Connection pooling and query caching can also help."},
            {"role": "user", "content": "How do I add composite indexes and when are they useful?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "What's the best way to handle file uploads in a Node.js API?"},
            {"role": "assistant", "content": "Use multer or busboy for parsing multipart uploads. Always validate file size, type (check magic bytes, not just extension), and sanitize filenames. Store files in object storage like S3 rather than the local filesystem."},
            {"role": "user", "content": "Write an upload handler that validates type and size, then streams to S3."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "I need to add caching to my API. Redis or in-memory?"},
            {"role": "assistant", "content": "Redis is better for multi-instance deployments since it's shared. In-memory caching (like node-cache) is faster but doesn't survive restarts and each server has its own cache. For a single-server setup, in-memory works fine."},
            {"role": "user", "content": "Write a caching middleware that works with both Redis and in-memory as backends."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "How do I write good unit tests for async code?"},
            {"role": "assistant", "content": "Always return or await promises in tests. Mock external dependencies (HTTP calls, databases). Test both success and error paths. Use beforeEach/afterEach for setup/teardown. For timers, use fake timers from your test framework."},
            {"role": "user", "content": "Show me how to test an async function that calls an external API with mocked responses."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "What's the best approach for database migrations in a team environment?"},
            {"role": "assistant", "content": "Use a migration tool like Knex, Prisma Migrate, or Flyway. Each migration should be versioned, idempotent where possible, and include both up and down scripts. Run migrations in CI before deployment. Never edit a deployed migration."},
            {"role": "user", "content": "How do I handle a migration that needs to backfill data for millions of rows?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "I'm implementing pagination for my API. Offset-based or cursor-based?"},
            {"role": "assistant", "content": "Offset-based is simpler but slow for large offsets (database still scans skipped rows) and can miss items when data changes. Cursor-based is more efficient and stable for real-time data. Use offset for admin dashboards, cursors for feeds."},
            {"role": "user", "content": "Implement cursor-based pagination for a PostgreSQL query using a timestamp column."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "How should I structure error responses in my REST API?"},
            {"role": "assistant", "content": "Use consistent error objects with a machine-readable code, human-readable message, and optional details field. Map internal errors to appropriate HTTP status codes. Include a request ID for debugging. Never leak stack traces in production."},
            {"role": "user", "content": "Create custom error classes and a function that formats them into API responses."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "When should I use WebSockets vs Server-Sent Events?"},
            {"role": "assistant", "content": "SSE is simpler, uses standard HTTP, auto-reconnects, and works well for one-way server-to-client streaming (notifications, live feeds). WebSockets support bidirectional communication but require more infrastructure. Use SSE unless you need client-to-server messaging."},
            {"role": "user", "content": "Write a basic SSE endpoint in Express that streams real-time notifications."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "How do I implement proper logging in a production Node.js app?"},
            {"role": "assistant", "content": "Use structured logging (JSON format) with a library like pino or winston. Include request IDs, timestamps, and log levels. Log to stdout (let the infrastructure handle routing). Don't log sensitive data."},
            {"role": "user", "content": "Write a logger setup with pino that includes request context and redacts sensitive fields."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "I'm getting CORS errors in my frontend. How do I fix them properly?"},
            {"role": "assistant", "content": "CORS errors mean your server isn't sending the right Access-Control headers. Use the cors middleware in Express. Be specific about allowed origins in production (don't use *). Handle preflight OPTIONS requests for non-simple requests."},
            {"role": "user", "content": "Write a CORS configuration that allows specific origins and handles credentials."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "Should I use an ORM or write raw SQL for my backend?"},
            {"role": "assistant", "content": "ORMs like Prisma or Drizzle speed up development, reduce SQL injection risk, and handle migrations. Raw SQL gives more control and can be more efficient for complex queries. A good middle ground is a query builder like Knex."},
            {"role": "user", "content": "Show me how to set up Drizzle with PostgreSQL and define a users table with relations."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "How do I implement feature flags in my application?"},
            {"role": "assistant", "content": "Start simple with a config-based approach. Store flags in a database or config file. Create a service that checks flag status by user/environment. For more advanced needs, use a service like LaunchDarkly or Unleash."},
            {"role": "user", "content": "Write a simple feature flag service that supports percentage rollouts."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "How should I handle secrets in my application?"},
            {"role": "assistant", "content": "Never hardcode secrets in code or commit them to git. Use environment variables for local development, and a secrets manager (AWS SSM, Vault, Doppler) for production. Validate all required secrets at startup and fail fast if any are missing."},
            {"role": "user", "content": "Write a function that validates required environment variables and provides clear error messages."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "I need to send emails from my Node.js app. What's the best approach?"},
            {"role": "assistant", "content": "Use a service like AWS SES, SendGrid, or Resend rather than running your own SMTP server. Send emails asynchronously via a queue for reliability. Use templates for consistent formatting. Handle bounces and complaints."},
            {"role": "user", "content": "Write an email service class that queues emails and handles retries."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "How do I implement API versioning?"},
            {"role": "assistant", "content": "Common approaches: URL path versioning (/v1/users), header versioning (Accept: application/vnd.api.v1+json), or query parameter (?version=1). URL path is most common and easiest to implement. Use a router to separate versions."},
            {"role": "user", "content": "Write a routing setup that supports v1 and v2 of a users API."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "What's the best way to handle concurrent requests to the same resource?"},
            {"role": "assistant", "content": "Use optimistic concurrency control with a version field. Check the version on update and reject if it changed. For more critical operations, use database-level locks or a distributed lock with Redis. Implement retry logic for conflicts."},
            {"role": "user", "content": "Show me how to implement optimistic locking with a version column in PostgreSQL."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "How do I properly implement webhook handling?"},
            {"role": "assistant", "content": "Always verify webhook signatures. Use idempotency keys to handle duplicates. Process webhooks asynchronously (queue them). Return 200 quickly. Log all incoming webhooks. Set up dead-letter queues for failed processing."},
            {"role": "user", "content": "Write a webhook handler that verifies Stripe signatures and queues events for processing."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "I need to implement search in my application. What are my options?"},
            {"role": "assistant", "content": "Options range from simple SQL LIKE/ILIKE queries, to PostgreSQL full-text search (pg_trgm + tsvector), to dedicated search engines like Elasticsearch, Meilisearch, or Typesense. Choose based on your data size and search complexity needs."},
            {"role": "user", "content": "Implement PostgreSQL full-text search with ranking and highlighting."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "How do I handle background jobs in Node.js?"},
            {"role": "assistant", "content": "Use a job queue library like BullMQ (Redis-based), pg-boss (PostgreSQL-based), or Temporal for complex workflows. Never rely on setTimeout for critical jobs. Jobs should be idempotent and have retry/backoff logic."},
            {"role": "user", "content": "Set up BullMQ with a worker that processes email jobs with retries."},
        ]
    },
]

# ============================================================
# BAND 0.5 — MEDIUM
# Multi-step reasoning, moderate code with error handling,
# comparing tradeoffs, debugging with context, writing tests
# 50% single-turn, 50% multi-turn (2-4 turns)
# ============================================================

BAND_05_SYSTEM_PROMPTS = [
    "You are a senior software architect who designs scalable systems.",
    "You are an expert developer who writes production-grade code with tests.",
    "You are a principal engineer who debugs complex issues methodically.",
    "You are a staff engineer who designs APIs and explains architectural decisions.",
    "You are a performance engineer who optimizes systems under load.",
    "You are an expert in distributed systems and data consistency.",
    "You are a senior backend engineer specializing in system design.",
    "You are a tech lead who designs maintainable and testable systems.",
    "You are an infrastructure engineer who builds reliable deployment pipelines.",
    "You are a security engineer who designs secure application architectures.",
    "You are a database architect who designs efficient schemas and queries.",
    "You are an API design expert who builds developer-friendly interfaces.",
    "You are an observability engineer who builds monitoring and alerting systems.",
    "You are a reliability engineer focused on building fault-tolerant systems.",
    "You are a platform engineer who builds developer tools and infrastructure.",
]

BAND_05_SINGLE_TURN = [
    "Write a retry mechanism with exponential backoff, jitter, and configurable max retries. Include TypeScript types and unit tests.",
    "Debug this SQL query that should return users with more than 3 orders but returns all users: SELECT u.* FROM users u LEFT JOIN orders o ON u.id = o.user_id GROUP BY u.id HAVING COUNT(o.id) > 3",
    "Explain the tradeoffs between Redis and Memcached for session storage in a distributed web application.",
    "Write a connection pool implementation in TypeScript that handles timeouts, health checks, and graceful shutdown.",
    "Design a rate limiter using the sliding window log algorithm. Explain why it's more accurate than fixed windows and implement it.",
    "Write a TypeScript middleware that validates request bodies against Zod schemas and returns detailed validation errors.",
    "Explain the tradeoffs between event-driven architecture and request-response patterns for an e-commerce order processing system.",
    "Write comprehensive unit tests for a function that calculates shipping costs based on weight, distance, and delivery speed.",
    "Debug this Node.js memory leak: a WebSocket server that stores client connections in a Map but doesn't clean up on disconnect.",
    "Write a TypeScript utility that implements a producer-consumer pattern with backpressure handling.",
    "Explain the CAP theorem and how it applies to choosing between PostgreSQL with read replicas vs DynamoDB.",
    "Write a database migration system that supports forward and rollback migrations with checksums.",
    "Design and implement a simple CQRS pattern for a blog post service with separate read and write models.",
    "Write a function that implements consistent hashing for distributing cache keys across multiple Redis nodes.",
    "Explain the tradeoffs between using database-level constraints vs application-level validation for data integrity.",
    "Write a TypeScript decorator that adds caching to class methods with configurable TTL and cache key generation.",
    "Debug this race condition: two concurrent API requests both read a counter as 5, increment it, and write 6 instead of 7.",
    "Write an integration test suite for a REST API that handles authentication, CRUD operations, and error cases.",
    "Explain the tradeoffs between using a saga pattern vs two-phase commit for distributed transactions.",
    "Write a health check endpoint that tests database connectivity, Redis availability, and external API reachability.",
    "Design a webhook delivery system with retry logic, delivery tracking, and failure notifications.",
    "Write a TypeScript service that handles file processing: upload to S3, generate thumbnails, and update database records.",
    "Explain the tradeoffs between using a message queue (RabbitMQ/SQS) vs an event stream (Kafka) for order processing.",
    "Write a circuit breaker implementation that tracks failure rates and automatically opens/closes based on thresholds.",
    "Debug this deadlock: two database transactions update the same two rows but in opposite order.",
    "Write unit and integration tests for a payment processing function that charges a card and creates an order.",
    "Explain the tradeoffs between sharding strategies (hash-based vs range-based) for a high-write database.",
    "Write a request batching utility that collects individual requests and executes them as a single batch operation.",
    "Design an API key management system with rotation, revocation, and usage tracking.",
    "Write a TypeScript function that implements optimistic locking with retry for database updates.",
    "Explain the tradeoffs between using a centralized logging service vs distributed tracing for debugging microservices.",
    "Write a data pipeline that reads from a CSV file, validates records, transforms data, and bulk inserts into PostgreSQL.",
    "Debug this query performance issue: a JOIN between a 10M row table and a 1M row table takes 30 seconds.",
    "Write a TypeScript class that implements a priority queue with O(log n) insertion and extraction.",
    "Explain the tradeoffs between server-side rendering, static site generation, and incremental static regeneration.",
    "Write a comprehensive test suite for a user authentication module including login, logout, token refresh, and password reset.",
    "Design a notification system that supports email, SMS, and push notifications with user preferences.",
    "Write a TypeScript function that implements a simple bloom filter with configurable false positive rate.",
    "Debug this issue: a cron job that processes payments sometimes charges customers twice.",
    "Write a middleware chain that handles authentication, authorization, rate limiting, and request validation.",
    "Explain the tradeoffs between using PostgreSQL LISTEN/NOTIFY vs Redis Pub/Sub for real-time features.",
    "Write a TypeScript service that implements idempotent API operations using idempotency keys.",
    "Design a configuration management system that supports environment-specific overrides and runtime updates.",
    "Write tests for a shopping cart module that handles adding items, updating quantities, applying discounts, and calculating totals.",
    "Explain the tradeoffs between using a task scheduler (cron) vs an event-driven approach for periodic data processing.",
    "Write a TypeScript utility for managing database transactions with savepoints and nested transaction support.",
    "Debug this issue: API responses are intermittently slow, and the database connection pool shows connections in IDLE state.",
    "Write a data validation layer that handles nested objects, arrays, conditional validation, and custom error messages.",
    "Design an audit logging system that tracks all data changes with before/after snapshots and user attribution.",
    "Write a TypeScript function that implements a leaky bucket rate limiter with Redis backing.",
    "Explain the tradeoffs between using a single database vs database-per-service in a microservices architecture.",
    "Write a comprehensive error handling system with custom error types, error codes, logging, and user-friendly messages.",
    "Design a simple job scheduling system that supports delayed jobs, recurring jobs, and job dependencies.",
    "Write tests for a permissions system that supports role-based access control with hierarchical permissions.",
    "Debug this issue: a React application shows stale data after a mutation because the cache isn't invalidated properly.",
    "Write a TypeScript service that handles graceful degradation when downstream services are unavailable.",
    "Explain the tradeoffs between using optimistic UI updates vs waiting for server confirmation.",
    "Write a migration script that safely renames a database column without downtime in a production system.",
    "Design a simple feature flag system that supports user targeting, percentage rollouts, and A/B testing.",
    "Write a TypeScript utility that implements request deduplication for concurrent identical API calls.",
    "Debug this data inconsistency: order totals in the orders table don't match the sum of line items.",
    "Write a comprehensive API client library with automatic retries, timeout handling, and request/response interceptors.",
    "Explain the tradeoffs between pull-based (polling) and push-based (streaming) approaches for real-time dashboards.",
    "Write a TypeScript function that processes large datasets in batches with progress reporting and cancellation support.",
    "Design a multi-tenant data isolation strategy using row-level security in PostgreSQL.",
    "Write tests for an email sending service that handles templates, attachments, and delivery failures.",
    "Debug this issue: a Node.js service gradually increases CPU usage over time until it becomes unresponsive.",
    "Write a TypeScript middleware that implements request signing and verification between microservices.",
    "Explain the tradeoffs between using a separate API gateway vs handling cross-cutting concerns in each service.",
    "Write a database query builder that supports filtering, sorting, pagination, and field selection.",
    "Design a simple distributed cache invalidation strategy for a multi-instance application.",
    "Write tests for a state machine that manages order lifecycle (created, paid, processing, shipped, delivered, refunded).",
    "Debug this N+1 query problem in a GraphQL resolver that fetches users with their posts and comments.",
    "Write a TypeScript utility for safe concurrent file operations with advisory locking.",
    "Explain the tradeoffs between using timestamps vs version vectors for conflict resolution in distributed systems.",
    "Write a comprehensive input sanitization module that handles SQL injection, XSS, and path traversal attacks.",
    "Design a simple event sourcing implementation for a bank account that tracks all balance changes.",
    "Write tests for a caching layer that handles TTL expiration, cache invalidation, and cache stampede prevention.",
    "Debug this issue: WebSocket connections drop after exactly 60 seconds in production but work fine locally.",
    "Write a TypeScript service that implements the outbox pattern for reliable event publishing.",
    "Explain the tradeoffs between using a time-series database vs a relational database for metrics storage.",
    "Write a data reconciliation script that compares records between two databases and reports discrepancies.",
    "Design a simple workflow engine that supports sequential, parallel, and conditional execution of tasks.",
    "Write tests for a payment retry system that handles different failure types with appropriate retry strategies.",
    "Debug this issue: API endpoint returns correct results for single requests but wrong results under concurrent load.",
    "Write a TypeScript utility that implements a read-through and write-through cache with Redis.",
    "Explain the tradeoffs between using database triggers vs application-level hooks for data change tracking.",
    "Write a robust CSV export function that handles large datasets, special characters, and streaming to the response.",
    "Design a simple dead letter queue system for handling failed message processing.",
    "Write tests for a URL shortener service that handles creation, redirection, analytics, and expiration.",
    "Debug this connection pool exhaustion: the application runs out of database connections during peak traffic.",
    "Write a TypeScript function that implements a distributed lock using Redis with proper expiry and renewal.",
    "Explain the tradeoffs between using materialized views vs computed columns for derived data in PostgreSQL.",
    "Write a request pipeline that handles authentication, rate limiting, input validation, and response formatting.",
    "Design a simple circuit breaker dashboard that shows service health, failure rates, and circuit states.",
    "Write tests for a notification preference system that handles multiple channels, schedules, and quiet hours.",
    "Debug this issue: database migrations work in development but fail in production due to lock timeout.",
    "Write a TypeScript utility for managing database connection pools with automatic scaling based on load.",
    "Explain the tradeoffs between using long-polling, SSE, and WebSockets for different real-time use cases.",
    "Write a comprehensive API testing framework that supports authentication, assertion helpers, and test data management.",
]

BAND_05_MULTI_TURN_TEMPLATES = [
    {
        "turns": [
            {"role": "user", "content": "I need to implement a retry mechanism for HTTP requests that handles different error types differently. What's the best approach?"},
            {"role": "assistant", "content": "You should differentiate between retryable errors (5xx, network errors, timeouts) and non-retryable errors (4xx). Use exponential backoff with jitter to avoid thundering herd. Set per-error-type retry limits and implement a circuit breaker for persistently failing endpoints."},
            {"role": "user", "content": "That makes sense. Can you implement this with TypeScript? I want configurable retry counts, backoff strategy, and the ability to specify which errors are retryable."},
            {"role": "assistant", "content": "Here's a TypeScript implementation with a RetryConfig interface, exponential backoff with full jitter, and a predicate function for determining retryability. It uses generics so it works with any async operation, not just HTTP."},
            {"role": "user", "content": "Now write tests for the retry mechanism covering success on first try, success after retries, exhausted retries, and non-retryable errors."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "My API returns inconsistent results under load. Sometimes the same query returns different row counts. What could cause this?"},
            {"role": "assistant", "content": "This is likely a concurrency issue. Possible causes: (1) read isolation level is too low (READ UNCOMMITTED), (2) transactions aren't properly scoped so you see partial writes, (3) caching returns stale data, (4) connection pooling sends requests to different replicas with replication lag. Check your transaction isolation level and whether you're using read replicas."},
            {"role": "user", "content": "We're using PostgreSQL with read replicas. The isolation level is READ COMMITTED. How do I fix the replication lag issue?"},
            {"role": "assistant", "content": "For read-your-writes consistency, route reads that follow writes to the primary for a short window. You can also use synchronous replication for critical reads (but it impacts write performance). A simpler approach is to add a version token: after a write, the client includes a version and the server ensures the replica is caught up."},
            {"role": "user", "content": "Write a middleware that routes read requests to replicas but falls back to the primary after recent writes."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "I'm designing a notification system. It needs to support email, SMS, push, and in-app notifications. How should I structure this?"},
            {"role": "assistant", "content": "Use the strategy pattern with a common NotificationChannel interface. Each channel (email, SMS, push, in-app) implements this interface. A NotificationService orchestrates delivery based on user preferences, message type, and channel availability. Queue notifications for reliability and decouple sending from the request cycle."},
            {"role": "user", "content": "How should I handle user preferences? Some users might want email for billing but push for marketing, and no notifications between 10PM and 8AM."},
            {"role": "assistant", "content": "Create a preferences model with notification categories (billing, marketing, alerts) and per-category channel selections. Add quiet hours with timezone support. Store preferences in a database and cache them. At delivery time, the NotificationService filters channels based on preferences and quiet hours."},
            {"role": "user", "content": "Write the core NotificationService class with the preference filtering, quiet hours check, and channel dispatch logic."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "We have a cron job that processes payments daily. Sometimes it charges customers twice. How do I prevent this?"},
            {"role": "assistant", "content": "This is an idempotency problem. The job likely crashes mid-processing and restarts from the beginning. Solutions: (1) mark each payment with a processing status before charging (pending -> processing -> completed), (2) use an idempotency key with your payment provider, (3) use a database transaction to atomically mark and process."},
            {"role": "user", "content": "We're using Stripe. How should I implement the idempotency key approach?"},
            {"role": "assistant", "content": "Generate a deterministic idempotency key from the payment details (e.g., `payment_{userId}_{invoiceId}_{date}`). Pass it as the Idempotency-Key header to Stripe. If the job retries, Stripe returns the original response instead of creating a new charge. Store the key and result in your database for auditing."},
            {"role": "user", "content": "Write the payment processing function with idempotency keys, status tracking, and proper error handling for different Stripe error types."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "I need to implement a feature flag system that supports gradual rollouts. What's a good design?"},
            {"role": "assistant", "content": "Design around three concepts: flags (name, type, default value), rules (conditions for enabling), and targeting (user segments). For gradual rollouts, hash the user ID to deterministically assign users to buckets. This ensures the same user always sees the same variant. Store flag configs in a database with an in-memory cache."},
            {"role": "user", "content": "I also need A/B testing with multiple variants, not just on/off. How does that change the design?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "Our PostgreSQL database is struggling with a query that joins 4 tables and has multiple WHERE conditions. It takes 15 seconds. Here's the EXPLAIN output..."},
            {"role": "assistant", "content": "The query planner is doing sequential scans on two of the four tables. This suggests missing indexes on the JOIN and WHERE columns. Also, the estimated rows are way off from actual rows, which means statistics are stale. Run ANALYZE on the affected tables, then add composite indexes on the columns used in your WHERE and JOIN clauses."},
            {"role": "user", "content": "After adding indexes, it's down to 3 seconds but I need it under 500ms. What else can I do?"},
            {"role": "assistant", "content": "Consider: (1) denormalize the data into a materialized view that you refresh periodically, (2) add a covering index so the query can be answered from the index alone without table lookups, (3) partition the largest table by date if your queries filter by time range, (4) reduce the result set with more specific filters or pagination."},
            {"role": "user", "content": "Write the materialized view definition and a refresh strategy that doesn't lock the view during rebuild."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "I want to implement event sourcing for our order management system. Where do I start?"},
            {"role": "assistant", "content": "Start with the event store: an append-only table with event_id, aggregate_id, event_type, data (JSON), and timestamp. Each order change is an event (OrderCreated, ItemAdded, PaymentReceived, Shipped). To get current state, replay all events for an aggregate. Use snapshots for performance when event counts grow large."},
            {"role": "user", "content": "How do I handle projections for read queries? I don't want to replay events on every read."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "I'm building a multi-tenant SaaS application. How should I isolate tenant data in PostgreSQL?"},
            {"role": "assistant", "content": "Three main approaches: (1) shared schema with tenant_id column and row-level security (simplest, best for many small tenants), (2) schema-per-tenant (good isolation, moderate complexity), (3) database-per-tenant (strongest isolation, hardest to manage). For most SaaS apps, shared schema with RLS is the best starting point."},
            {"role": "user", "content": "Let's go with shared schema and RLS. How do I set it up to prevent any possibility of data leakage between tenants?"},
            {"role": "assistant", "content": "Create RLS policies on every tenant table. Set the tenant context at the start of each request using `SET LOCAL app.current_tenant = 'tenant_id'`. Use a middleware to set this on every database transaction. Add a CHECK constraint that tenant_id matches the session variable for extra safety on inserts."},
            {"role": "user", "content": "Write the SQL setup for RLS policies and the Express middleware that sets the tenant context per request."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "Our WebSocket connections keep dropping after 60 seconds in production but work fine locally. What should I check?"},
            {"role": "assistant", "content": "This is almost certainly a proxy or load balancer issue. Most proxies (nginx, ALB, CloudFront) have default idle timeout of 60 seconds. If no messages are sent in that window, the connection is closed. Solutions: (1) implement ping/pong heartbeats, (2) increase proxy idle timeout, (3) use WebSocket-aware load balancer configuration."},
            {"role": "user", "content": "We're behind nginx. How should I configure it and implement heartbeats?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "I need to design an API key management system. What should it include?"},
            {"role": "assistant", "content": "Core features: (1) key generation with a prefix for identification (pk_live_, pk_test_), (2) key hashing (store hashed, only show full key once at creation), (3) scoping (which resources/actions a key can access), (4) rate limiting per key, (5) expiration and rotation, (6) audit logging of key usage. Use constant-time comparison to prevent timing attacks."},
            {"role": "user", "content": "How should I handle key rotation without breaking existing integrations?"},
            {"role": "assistant", "content": "Support multiple active keys per account with overlap periods. When rotating: (1) create new key, (2) old key stays active for a grace period (e.g., 30 days), (3) send notifications before old key expires. Allow users to revoke old keys early. Track last-used timestamp to identify unused keys."},
            {"role": "user", "content": "Implement the key generation, hashing, validation, and rotation logic in TypeScript with proper error handling."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "We need to migrate a large PostgreSQL table (~50M rows) to add a new NOT NULL column with a default value. How do we avoid downtime?"},
            {"role": "assistant", "content": "Since PostgreSQL 11+, adding a column with a DEFAULT and NOT NULL is fast because it stores the default in the catalog rather than rewriting the table. However, if you need to backfill computed values, use a multi-step approach: (1) add nullable column, (2) backfill in batches, (3) add NOT NULL constraint."},
            {"role": "user", "content": "We need to backfill computed values. Write a migration script that batches the update to avoid locking."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "I'm seeing intermittent 502 errors from our Node.js API behind a load balancer. The errors happen mostly during deployments but also occasionally during normal operation."},
            {"role": "assistant", "content": "During deployments: your old instances are killed before draining in-flight requests. Implement graceful shutdown: stop accepting new connections, wait for in-flight requests to complete (with a timeout), then exit. During normal operation: check if your server has proper keep-alive settings matching the load balancer's timeout."},
            {"role": "user", "content": "Write a graceful shutdown handler for an Express server that drains connections, closes database pools, and handles the SIGTERM signal."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "How do I test a complex state machine that manages order lifecycle (created -> paid -> processing -> shipped -> delivered, with refund branches)?"},
            {"role": "assistant", "content": "Test each valid transition, invalid transition, and edge case. Use a table-driven test approach: define all valid transitions and their expected states. Test guard conditions (e.g., can't ship if not paid). Test event side effects (e.g., shipping triggers email). Use a test helper that creates orders in specific states."},
            {"role": "user", "content": "Write the state machine implementation and comprehensive tests covering happy paths, invalid transitions, and edge cases."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "Our application has a cache stampede problem: when a popular cached item expires, hundreds of concurrent requests all try to regenerate it simultaneously, overwhelming the database."},
            {"role": "assistant", "content": "Several solutions: (1) lock-based: only one request regenerates while others wait, (2) probabilistic early expiration: randomly refresh before TTL hits, (3) background refresh: keep serving stale data while refreshing in the background, (4) request coalescing: deduplicate concurrent identical requests. The best approach depends on your tolerance for stale data."},
            {"role": "user", "content": "I want the background refresh approach. How does it work with Redis?"},
            {"role": "assistant", "content": "Store two TTLs: a soft TTL (when data is considered stale) and a hard TTL (when data is deleted). When the soft TTL is hit, serve the stale data immediately and trigger a background refresh. Use a lock to ensure only one refresh runs. The hard TTL acts as a safety net."},
            {"role": "user", "content": "Implement this cache-aside pattern with soft/hard TTL and background refresh using Redis."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "We need to implement a distributed job queue where jobs must be processed exactly once, even if a worker crashes mid-processing."},
            {"role": "assistant", "content": "Use a two-phase approach: (1) claim the job with an atomic update (status: pending -> processing, set worker_id and lock_expiry), (2) process the job, (3) mark complete. A reaper process periodically reclaims jobs where lock_expiry has passed (worker crashed). Use database transactions for atomicity."},
            {"role": "user", "content": "We're using PostgreSQL. Write the table schema, claim query, and reaper logic. Include visibility timeout and max retry tracking."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "I need to build an audit log system that captures all changes to sensitive entities (users, orders, payments). What's the best approach?"},
            {"role": "assistant", "content": "Use database triggers or application-level middleware to capture before/after snapshots on every write. Store: entity_type, entity_id, action (create/update/delete), changed_fields (JSON diff), actor_id, ip_address, timestamp. Use an append-only table. For compliance, consider immutability (no updates/deletes on audit logs)."},
            {"role": "user", "content": "We need both database-level capture (for direct SQL changes) and application-level capture (for user context). How do we combine them?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "Our REST API needs to support batch operations. A client might need to create 100 products at once. What's the best design?"},
            {"role": "assistant", "content": "Design a batch endpoint that accepts an array of operations. Process them in a transaction for atomicity (all succeed or all fail), or individually with per-item status reporting (partial success). Set size limits. Return detailed results with per-item success/error info. Support async processing for large batches."},
            {"role": "user", "content": "Write a batch endpoint handler that processes items in a transaction, validates each item, and returns detailed per-item results."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "I'm building a search feature with PostgreSQL. The table has 5 million products and users search by name, category, and description. How do I make it fast?"},
            {"role": "assistant", "content": "Use PostgreSQL full-text search with tsvector columns and GIN indexes. Create a tsvector column that combines name (weight A), category (weight B), and description (weight C). Add a GIN index on it. Use ts_rank for relevance scoring. For fuzzy matching, add pg_trgm extension with a GiST index."},
            {"role": "user", "content": "Write the migration to set up the tsvector column, trigger, and indexes. Then write the search query function with ranking and pagination."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "How should I handle data migration when splitting a monolith into microservices? Currently all data is in one PostgreSQL database."},
            {"role": "assistant", "content": "Follow a phased approach: (1) identify service boundaries and their data, (2) create the new service's database, (3) set up dual-write: write to both databases during transition, (4) backfill historical data, (5) switch reads to the new database, (6) stop writing to the old database. Use change data capture for consistency."},
            {"role": "user", "content": "The user service and order service share the users table. Orders reference user_id. How do I handle this cross-service data dependency?"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "I need to write integration tests for an API that depends on a PostgreSQL database and Redis cache. How do I set up the test environment?"},
            {"role": "assistant", "content": "Use testcontainers to spin up real PostgreSQL and Redis instances in Docker for each test suite. Run migrations before tests. Use transaction wrapping or truncation between tests for isolation. Create factory functions for test data. Mock only external services (payment APIs, email)."},
            {"role": "user", "content": "Write the test setup/teardown helpers and a sample integration test for a user registration endpoint that creates a user and sends a welcome email."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "Our Node.js service handles 1000 requests per second but we need to scale to 10,000. The bottleneck seems to be CPU-bound JSON processing. What are our options?"},
            {"role": "assistant", "content": "Options: (1) use worker threads to parallelize CPU-bound work across cores, (2) use cluster mode (PM2/built-in) to run multiple processes, (3) optimize the JSON processing itself (simpler-json, protobuf, or MessagePack instead of JSON), (4) move heavy processing to a separate service/queue, (5) use streaming JSON parsing for large payloads."},
            {"role": "user", "content": "Show me how to implement worker threads for the JSON processing while keeping the main event loop responsive."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "I need to implement a distributed rate limiter that works across multiple API instances. The rate limit is per API key."},
            {"role": "assistant", "content": "Use Redis with a sliding window approach. The sliding window log algorithm stores each request timestamp in a sorted set, giving exact counts. The sliding window counter algorithm approximates using fixed windows and is more memory-efficient. For most APIs, the counter approach is sufficient."},
            {"role": "user", "content": "Implement the sliding window counter algorithm with Redis. It should support different limits for different API key tiers."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "We're getting deadlocks in PostgreSQL when processing concurrent orders that update inventory. How should we redesign this?"},
            {"role": "assistant", "content": "Deadlocks happen when transactions lock rows in different orders. Solutions: (1) always lock rows in a consistent order (sort by product_id), (2) use SELECT FOR UPDATE SKIP LOCKED for queue-like processing, (3) use advisory locks for coarse-grained locking, (4) redesign to use optimistic concurrency with version columns."},
            {"role": "user", "content": "We have multiple products per order. Write an order processing function that updates inventory for all products without deadlocks."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "I need to build a system that sends reminder emails at user-specified times (e.g., remind me about X in 3 days at 9am). How should I architecture this?"},
            {"role": "assistant", "content": "Use a scheduled jobs table with columns: id, user_id, scheduled_at (UTC), payload, status. A worker process polls for due jobs every minute. For better accuracy, use a dedicated scheduler like BullMQ's delayed jobs or pg-boss. Handle timezone conversion carefully — store in UTC, convert using the user's timezone."},
            {"role": "user", "content": "Write the job scheduler and worker, including timezone handling, retry logic for failed email sends, and deduplication."},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "Our tests are flaky — about 5% fail randomly on CI but pass when run individually. How do I diagnose and fix this?"},
            {"role": "assistant", "content": "Common causes of flaky tests: (1) shared state between tests (database, global variables), (2) timing-dependent assertions (race conditions, setTimeout), (3) test order dependencies, (4) external service calls without mocks, (5) date/time dependent logic. Start by running tests in random order to find order dependencies. Add proper isolation with before/afterEach cleanup."},
            {"role": "user", "content": "Write a test utility that helps detect shared state issues: a wrapper that runs each test in isolation, tracks global state changes, and reports violations."},
        ]
    },
]


def build_messages(system_prompt, turns):
    """Build the messages array for a sample."""
    messages = [{"role": "system", "content": system_prompt}]
    for turn in turns:
        messages.append({"role": turn["role"], "content": turn["content"]})
    return messages


def generate_band_03(count=500):
    """Generate band 0.3 samples: 70% single-turn, 30% multi-turn."""
    samples = []
    single_count = int(count * 0.7)
    multi_count = count - single_count

    # Single-turn samples
    for i in range(single_count):
        sys_prompt = BAND_03_SYSTEM_PROMPTS[i % len(BAND_03_SYSTEM_PROMPTS)]
        user_msg = BAND_03_SINGLE_TURN[i % len(BAND_03_SINGLE_TURN)]
        messages = [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_msg},
        ]
        samples.append({"messages": messages, "score": 0.3})

    # Multi-turn samples
    for i in range(multi_count):
        sys_prompt = BAND_03_SYSTEM_PROMPTS[i % len(BAND_03_SYSTEM_PROMPTS)]
        template = BAND_03_MULTI_TURN_TEMPLATES[i % len(BAND_03_MULTI_TURN_TEMPLATES)]
        messages = build_messages(sys_prompt, template["turns"])
        samples.append({"messages": messages, "score": 0.3})

    random.shuffle(samples)
    return samples


def generate_band_04(count=500):
    """Generate band 0.4 samples: 60% single-turn, 40% multi-turn."""
    samples = []
    single_count = int(count * 0.6)
    multi_count = count - single_count

    # Single-turn samples
    for i in range(single_count):
        sys_prompt = BAND_04_SYSTEM_PROMPTS[i % len(BAND_04_SYSTEM_PROMPTS)]
        user_msg = BAND_04_SINGLE_TURN[i % len(BAND_04_SINGLE_TURN)]
        messages = [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_msg},
        ]
        samples.append({"messages": messages, "score": 0.4})

    # Multi-turn samples
    for i in range(multi_count):
        sys_prompt = BAND_04_SYSTEM_PROMPTS[i % len(BAND_04_SYSTEM_PROMPTS)]
        template = BAND_04_MULTI_TURN_TEMPLATES[i % len(BAND_04_MULTI_TURN_TEMPLATES)]
        messages = build_messages(sys_prompt, template["turns"])
        samples.append({"messages": messages, "score": 0.4})

    random.shuffle(samples)
    return samples


def generate_band_05(count=500):
    """Generate band 0.5 samples: 50% single-turn, 50% multi-turn."""
    samples = []
    single_count = int(count * 0.5)
    multi_count = count - single_count

    # Single-turn samples
    for i in range(single_count):
        sys_prompt = BAND_05_SYSTEM_PROMPTS[i % len(BAND_05_SYSTEM_PROMPTS)]
        user_msg = BAND_05_SINGLE_TURN[i % len(BAND_05_SINGLE_TURN)]
        messages = [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_msg},
        ]
        samples.append({"messages": messages, "score": 0.5})

    # Multi-turn samples
    for i in range(multi_count):
        sys_prompt = BAND_05_SYSTEM_PROMPTS[i % len(BAND_05_SYSTEM_PROMPTS)]
        template = BAND_05_MULTI_TURN_TEMPLATES[i % len(BAND_05_MULTI_TURN_TEMPLATES)]
        messages = build_messages(sys_prompt, template["turns"])
        samples.append({"messages": messages, "score": 0.5})

    random.shuffle(samples)
    return samples


def main():
    output_path = "/home/tsavo/platform-core/scripts/train-classifier/band_1.jsonl"

    band_03 = generate_band_03(500)
    band_04 = generate_band_04(500)
    band_05 = generate_band_05(500)

    all_samples = band_03 + band_04 + band_05

    with open(output_path, "w") as f:
        for sample in all_samples:
            f.write(json.dumps(sample, ensure_ascii=False) + "\n")

    # Print summary
    print(f"Total samples: {len(all_samples)}")
    print(f"Band 0.3: {len(band_03)}")
    print(f"Band 0.4: {len(band_04)}")
    print(f"Band 0.5: {len(band_05)}")

    # Verify multi-turn ratios
    mt_03 = sum(1 for s in band_03 if len(s["messages"]) > 2)
    mt_04 = sum(1 for s in band_04 if len(s["messages"]) > 2)
    mt_05 = sum(1 for s in band_05 if len(s["messages"]) > 2)
    print(f"Band 0.3 multi-turn: {mt_03}/{len(band_03)} ({mt_03/len(band_03)*100:.0f}%)")
    print(f"Band 0.4 multi-turn: {mt_04}/{len(band_04)} ({mt_04/len(band_04)*100:.0f}%)")
    print(f"Band 0.5 multi-turn: {mt_05}/{len(band_05)} ({mt_05/len(band_05)*100:.0f}%)")

    # Verify line count
    with open(output_path, "r") as f:
        lines = f.readlines()
    print(f"JSONL lines written: {len(lines)}")

    # Validate JSON
    errors = 0
    for i, line in enumerate(lines):
        try:
            obj = json.loads(line)
            assert "messages" in obj
            assert "score" in obj
            assert obj["score"] in (0.3, 0.4, 0.5)
        except Exception as e:
            errors += 1
            print(f"Error on line {i+1}: {e}")
    print(f"Validation errors: {errors}")


if __name__ == "__main__":
    main()
