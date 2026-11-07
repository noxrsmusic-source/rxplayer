// generate.js
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');
const fs = require('fs');
const path = require('path');

const firebaseConfig = {
    apiKey: "AIzaSyCa-Ut8CCiZac7MPpeuw0LSjLehqLO4ICw",
    authDomain: "rxplayer-a2582.firebaseapp.com",
    projectId: "rxplayer-a2582",
    storageBucket: "rxplayer-a2582.firebasestorage.app",
    messagingSenderId: "208971977557",
    appId: "1:208971977557:web:501ee9138aa40dbef595dc"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Path: Root se articles/template.html
const templatePath = path.join(__dirname, 'articles', 'template.html');
const template = fs.readFileSync(templatePath, 'utf8'); 

async function generateArticles() {
    console.log("Fetching articles from Firebase...");
    const querySnapshot = await getDocs(collection(db, "articles"));
    
    // Output folder articles/ mein hi banega
    const outputDir = path.join(__dirname, 'articles');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

    querySnapshot.forEach((doc) => {
        const data = doc.data();
        const id = doc.id;
        const title = data.title || 'Untitled';
        const content = data.content || '<p>No content</p>';
        const image = data.image || 'https://res.cloudinary.com/du9nysbwl/image/upload/v1788457070/rxplayerlogo_ppyvfr.jpg';
        
        let dateStr = 'Recent';
        if (data.date) {
            dateStr = new Date(data.date.seconds * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        }

        const plainText = content.replace(/<[^>]+>/g, ' '); 
        const description = plainText.substring(0, 150).trim() + '...';

        let finalHtml = template
            .replace(/{{ID}}/g, id)
            .replace(/{{TITLE}}/g, title)
            .replace(/{{DESCRIPTION}}/g, description)
            .replace(/{{IMAGE}}/g, image)
            .replace(/{{CONTENT}}/g, content)
            .replace(/{{DATE}}/g, dateStr);

        const filePath = path.join(outputDir, `${id}.html`);
        fs.writeFileSync(filePath, finalHtml);
        console.log(`Generated: ${filePath}`);
    });

    console.log("All articles generated successfully!");
}

generateArticles().catch(console.error);
