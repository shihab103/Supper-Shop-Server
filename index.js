const { MongoClient, ServerApiVersion } = require("mongodb");
const express = require("express");
require("dotenv").config();
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;

// middleware
app.use(cors());
app.use(express.json());

// db drives

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(`${process.env.MONGODB_URI}`, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // operation start
    const db = client.db("SupperShop");
    const userCollection = db.collection("users");
    const categoryCollection = db.collection("category");
    const productCollection = db.collection("products");

    // add category
    app.post("/add-category", async (req, res) => {
      const categoryData = req.body;
      const result = await categoryCollection.insertOne(categoryData);
      res.send(result);
    });

    // get category
    app.get("/get-category", async (req, res) => {
      const allCategory = await categoryCollection.find().toArray();
      res.send(allCategory);
    });

    // add product
    app.post("/add-product", async (req, res) => {
      const product = req.body;
      product.createdAt = new Date();
      const result = await productCollection.insertOne(product);
      res.send(result);
    });

    // all product
    app.get("/all-products", async (req, res) => {
      const allProduct = await productCollection.find().toArray();
      res.send(allProduct);
    });

    // GET products by category ID
    app.get("/products-by-category/:categoryId", async (req, res) => {
      const { categoryId } = req.params;
      try {
        const products = await productCollection.find({ categoryId }).toArray();
        res.send(products);
      } catch (error) {
        console.error("Error fetching products by category ID:", error);
        res.status(500).send({ error: "Something went wrong" });
      }
    });

    // operation end

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello world");
});

app.listen(port, (req, res) => {
  console.log(`Server running on port ${port}`);
});
