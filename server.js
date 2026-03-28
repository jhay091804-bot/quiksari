const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const Groq = require('groq-sdk');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Serve static frontend files
app.use(express.static(__dirname));

const DB_FILE = path.join(__dirname, 'db.json');

// Ensure DB exists
if (!fs.existsSync(DB_FILE)) {
    // Let's add the default admin
    const defaultData = {
        users: [
            { user: 'admin', pass: 'admin123', role: 'admin', name: 'Administrator', verified: true },
            { user: 'user', pass: 'user123', role: 'user', name: 'Guest User', verified: true }
        ]
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData));
}

function getDB() {
    return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Nodemailer Setup
let transporter;

if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    // Real Email via Gmail
    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
    console.log(`✅ Mail server ready using REAL GMAIL (Sending from ${process.env.EMAIL_USER})`);
} else {
    // Fallback to Test account
    nodemailer.createTestAccount((err, account) => {
        if (err) {
            console.error('Failed to create a testing account. ' + err.message);
            return process.exit(1);
        }
        transporter = nodemailer.createTransport({
            host: account.smtp.host,
            port: account.smtp.port,
            secure: account.smtp.secure,
            auth: {
                user: account.user,
                pass: account.pass
            }
        });
        console.log(`✅ Mail server ready (Ethereal test account initialized).`);
    });
}

// Registration API
app.post('/api/register', async (req, res) => {
    const { name, contact, email, user, pass, confirmPass } = req.body;

    if (!name || !contact || !email || !user || !pass || !confirmPass) {
        return res.status(400).json({ error: 'All fields are required.' });
    }
    if (pass !== confirmPass) {
        return res.status(400).json({ error: 'Passwords do not match.' });
    }
    const db = getDB();
    if (db.users.find(u => u.user === user)) {
        return res.status(400).json({ error: 'Username already taken.' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store unverified user
    db.users.push({
        name,
        contact,
        email,
        user,
        pass, // In production, never store plaintext!
        role: 'user',
        verified: false,
        otp
    });
    saveDB(db);

    // Send the Verification Email
    try {
        const info = await transporter.sendMail({
            from: '"QuickSari Store" <noreply@quicksari.local>',
            to: email,
            subject: 'QuickSari - Verify Your Account',
            text: `Hi ${name},\n\nYour QuickSari verification code is: ${otp}\n\nEnter this code on the website to complete your registration.`,
            html: `<div style="font-family:Arial,sans-serif;text-align:center;padding:20px;">
                    <h2 style="color:#059669;">QuickSari Verification</h2>
                    <p>Hi <strong>${name}</strong>, to complete your registration, enter this 6-digit code on the website:</p>
                    <h1 style="letter-spacing:5px;background:#f3f4f6;padding:15px;display:inline-block;border-radius:10px;">${otp}</h1>
                   </div>`
        });

        console.log(`\n\n======================================`);
        console.log(`📧 NEW EMAIL SENT TO: ${email}`);
        const testUrl = nodemailer.getTestMessageUrl(info);
        if (testUrl) {
            console.log(`🔗 PREVIEW URL (Click to view Email): ${testUrl}`);
        } else {
            console.log(`✅ Email successfully delivered via Real SMTP! Check the inbox.`);
        }
        console.log(`======================================\n\n`);

        res.json({ message: 'Registration successful! Verification code sent to your email.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to send verification email.' });
    }
});

// OTP Verification API
app.post('/api/verify', (req, res) => {
    const { user, otp } = req.body;
    const db = getDB();
    const userIndex = db.users.findIndex(u => u.user === user);

    if (userIndex === -1) {
        return res.status(400).json({ error: 'User not found.' });
    }

    if (db.users[userIndex].verified) {
        return res.status(400).json({ error: 'Account already verified.' });
    }

    if (db.users[userIndex].otp !== otp) {
        return res.status(400).json({ error: 'Invalid verification code.' });
    }

    // Success - verify user
    db.users[userIndex].verified = true;
    delete db.users[userIndex].otp; // clear the otp
    saveDB(db);

    res.json({ message: 'Account verified successfully!', user: { user: db.users[userIndex].user, name: db.users[userIndex].name, role: db.users[userIndex].role } });
});

// ── AI Chatbot (Groq) ────────────────────────────────────────────────────────
const QUICKSARI_SYSTEM_PROMPT = `You are GrowSari Assistant, the friendly and helpful AI chatbot for QuickSari — a Filipino neighborhood sari-sari store web app.

About QuickSari / GrowSari:
- It is a modern online sari-sari store selling everyday Filipino grocery products
- Categories: Canned Goods, Instant Food, Biscuits, Drinks, Household essentials
- Popular products: 555 Sardines, Lucky Me Pancit Canton, Rebisco Biscuits, Coca-Cola, Argentina Corned Beef, Cup Noodles, and more
- Prices range from ₱8 to ₱850 depending on the product

Key Features you can assist users with:
1. Shopping: Browse products, search by name or category, add to cart, checkout
2. Payment: GCash, Maya, Debit/Credit Card, GrowSari Wallet, Cash on Delivery (COD)
3. Order Tracking: Users can track To Pay → To Ship → To Receive → Complete
4. GrowSari Wallet: Digital wallet for cash in, withdraw, bank transfer, send money to other users
5. Kwarta Loan: Users can apply for a quick cash loan (₱500–₱8,000 depending on credit limit). Photos of ID (front/back) and selfie are required. System auto-approves or rejects in seconds. Users repay via wallet, and get a credit limit evaluation after each repayment — paying on time increases the limit by 10–30%.
6. Accounts: Users must register with email OTP verification. Admin has a special dashboard.
7. Admin Panel: Only for store admins — manage products, orders, wallet requests, loan management

Rules for your responses:
- Always respond in a friendly, helpful, conversational tone
- Use Filipino/English (Taglish is perfectly fine if the user uses it)
- Keep answers concise but complete — ideally 1-3 short paragraphs
- Use emojis sparingly but appropriately
- If asked about loans, explain the Kwarta Loan system clearly
- Never make up specific prices, schedules, or policies not listed above

You are NOT an admin and cannot access user data, orders, or accounts.`;

app.post('/api/chat', async (req, res) => {
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required.' });

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        return res.status(503).json({ error: 'AI chatbot is not configured. Please add GROQ_API_KEY to your .env file. Get a free key at https://console.groq.com' });
    }

    try {
        const groq = new Groq({ apiKey });

        // Build conversation messages for multi-turn chat
        const messages = [
            { role: 'system', content: QUICKSARI_SYSTEM_PROMPT },
            ...(history || []).slice(-10).map(h => ({ role: h.role === 'model' ? 'assistant' : h.role, content: h.text })),
            { role: 'user', content: message }
        ];

        const completion = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages,
            max_tokens: 512,
            temperature: 0.7,
        });

        const reply = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
        console.log(`✅ Groq AI responded (${completion.usage?.completion_tokens || '?'} tokens)`);
        res.json({ reply });

    } catch (err) {
        console.error('Groq API error:', err.message);
        const isQuota = err.status === 429;
        const isAuth  = err.status === 401;
        res.status(500).json({
            error: isAuth  ? 'Invalid Groq API key. Please check your GROQ_API_KEY in .env.' :
                   isQuota ? 'Groq API rate limit reached. Please wait a moment and try again.' :
                             'AI assistant is temporarily unavailable. Please try again.'
        });
    }
});
// ─────────────────────────────────────────────────────────────────────────────

// Login API
app.post('/api/login', (req, res) => {
    const { user, pass } = req.body;
    const db = getDB();
    const found = db.users.find(u => u.user === user && u.pass === pass);

    if (!found) {
        return res.status(401).json({ error: 'Incorrect username or password.' });
    }

    if (!found.verified) {
        return res.status(403).json({ error: 'Please verify your email address first.' });
    }

    res.json({ message: 'Login successful!', user: { user: found.user, name: found.name, role: found.role } });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 QuickSari Backend is running at http://localhost:${PORT}`);
    console.log(`(Leave this terminal open)`);
});
