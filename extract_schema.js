import { MongoClient } from "mongodb";
import fs from "fs";
import path from "path";

const uri = "mongodb+srv://Societycis:Societyforcis2025@cluster0.stegtum.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const dbName = "societycis";
const outputFolder = "schema";

const client = new MongoClient(uri);

function getType(value) {
    if (Array.isArray(value)) return "array";
    if (value === null) return "null";
    if (value instanceof Date) return "date";
    if (typeof value === "object" && value && value._bsontype === "ObjectID") return "objectId";
    return typeof value;
}

async function extractSchema() {
    try {
        console.log("Connecting to MongoDB...");
        await client.connect();
        console.log("Connected successfully!");

        const db = client.db(dbName);
        const collections = await db.listCollections().toArray();

        // Create schema directory if it doesn't exist
        if (!fs.existsSync(outputFolder)) {
            fs.mkdirSync(outputFolder);
            console.log(`Created directory: ${outputFolder}`);
        }

        for (const col of collections) {
            const name = col.name;
            console.log(`Processing collection: ${name}`);
            const docs = await db.collection(name).find().limit(100).toArray();

            const colSchema = {};

            docs.forEach(doc => {
                Object.entries(doc).forEach(([key, value]) => {
                    const type = getType(value);
                    if (!colSchema[key]) {
                        colSchema[key] = new Set();
                    }
                    colSchema[key].add(type);
                });
            });

            // Convert Sets back to Arrays for JSON serialization
            const finalColSchema = {};
            Object.keys(colSchema).forEach(k => {
                finalColSchema[k] = Array.from(colSchema[k]);
            });

            const outputPath = path.join(outputFolder, `${name}.json`);
            fs.writeFileSync(outputPath, JSON.stringify(finalColSchema, null, 2));
            console.log(`Saved: ${outputPath}`);
        }

        console.log(`\n✅ All collection schemas extracted and saved to the '${outputFolder}' folder.`);

    } catch (error) {
        console.error("\n❌ Error during schema extraction:");
        console.error(error);
    } finally {
        await client.close();
    }
}

extractSchema();
