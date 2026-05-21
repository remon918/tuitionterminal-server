const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const port = process.env.PORT || 8000;

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

const JWKS = createRemoteJWKSet(
    new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
);

const verifyToken = async (req, res, next) => {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            message: "Unauthorized"
        });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            message: "Unauthorized"
        });
    }

    try {

        const { payload } = await jwtVerify(
            token,
            JWKS
        );

        req.user = payload;

        next();

    } catch (error) {

        return res.status(403).json({
            message: "Forbidden"
        });
    }
};

async function run() {

    try {
        const db = client.db('tuitionterminal');
        const tutorsCollection =
            db.collection('tutors');
        const bookingCollection =
            db.collection('booking');
        const addedTutorsCollection =
            db.collection('addedtutors');

        app.get(
            "/addedtutors",
            verifyToken,
            async (req, res) => {
                const result =
                    await addedTutorsCollection
                        .find()
                        .toArray();
                res.send(result);
            }
        );
        app.post(
            '/addedtutors',
            verifyToken,
            async (req, res) => {
                const addedTutorsData = {
                    ...req.body,
                    seasonStartDate:
                        req.body.seasonStartDate,
                    seasonEndDate:
                        req.body.seasonEndDate,
                };
                const result =
                    await addedTutorsCollection
                        .insertOne(addedTutorsData);
                res.send(result);
            }
        );
        app.patch(
            '/addedtutors/:id',
            verifyToken,
            async (req, res) => {
                const { id } = req.params;
                const updatedData = {
                    ...req.body,
                    seasonStartDate:
                        req.body.seasonStartDate,
                    seasonEndDate:
                        req.body.seasonEndDate,
                };
                const result =
                    await addedTutorsCollection
                        .updateOne(
                            {
                                _id:
                                    new ObjectId(id)
                            },
                            {
                                $set: updatedData
                            }
                        );
                res.send(result);
            }
        );

        app.delete(
            '/addedtutors/:id',
            verifyToken,
            async (req, res) => {
                const { id } = req.params;
                const result =
                    await addedTutorsCollection
                        .deleteOne({
                            _id:
                                new ObjectId(id)
                        });
                res.send(result);
            }
        );

        app.get('/tutors', async (req, res) => {
            const search =
                req.query.search || "";
            const startDate =
                req.query.startDate;
            const endDate =
                req.query.endDate;
            const result =
                await tutorsCollection
                    .find()
                    .toArray();
            const filtered =
                result.filter((tutor) => {
                    const matchesSearch =
                        tutor.name
                            .toLowerCase()
                            .includes(
                                search.toLowerCase()
                            );
                    const tutorDate =
                        new Date(
                            tutor.seasonStartDate
                        );
                    const start =
                        startDate
                            ? new Date(startDate)
                            : null;
                    const end =
                        endDate
                            ? new Date(endDate)
                            : null;
                    const matchesDate =
                        (!start || tutorDate >= start) &&
                        (!end || tutorDate <= end);
                    return (
                        matchesSearch &&
                        matchesDate
                    );
                });
            res.send(filtered);
        });

        app.get('/featured', async (req, res) => {
            const result =
                await tutorsCollection
                    .find()
                    .limit(3)
                    .toArray();
            res.send(result);
        });
        app.get(
            '/tutors/:tutorsId',
            verifyToken,
            async (req, res) => {
                const { tutorsId } =
                    req.params;
                const result =
                    await tutorsCollection
                        .findOne({
                            _id:
                                new ObjectId(tutorsId)
                        });
                res.send(result);
            }
        );

        app.post(
            '/booking',
            verifyToken,
            async (req, res) => {
                const bookingData = req.body;
                // already booked check
                const existingBooking =
                    await bookingCollection.findOne({
                        tutorId: bookingData.tutorId,
                        userId: bookingData.userId,
                    });
                if (existingBooking) {
                    return res.status(400).send({
                        message: "Already booked this tutor",
                    });
                }
                // create booking
                const result =
                    await bookingCollection.insertOne(
                        bookingData
                    );
                res.json(result);
            }
        );

        app.get(
            '/booking/:userId',
            verifyToken,
            async (req, res) => {
                const { userId } =
                    req.params;
                const result =
                    await bookingCollection
                        .find({
                            userId: userId
                        })
                        .toArray();
                res.send(result);
            }
        );

        app.patch(
            "/booking/:id",
            verifyToken,
            async (req, res) => {
                const { id } =
                    req.params;
                const result =
                    await bookingCollection
                        .updateOne(
                            {
                                _id:
                                    new ObjectId(id)
                            },
                            {
                                $set: {
                                    status: "Cancelled",
                                },
                            }
                        );
                res.send(result);
            }
        );

        app.patch(
            "/tutors/slot/:id",
            verifyToken,
            async (req, res) => {
                const { id } = req.params;
                const tutor =
                    await tutorsCollection.findOne({
                        _id: new ObjectId(id),
                    });
                if (!tutor) {
                    return res.status(404).send({
                        message: "Tutor not found",
                    });
                }
                const currentSlots =
                    Number(tutor.availableSlots);
                if (currentSlots <= 0) {
                    return res.status(400).send({
                        message: "No slots available",
                    });
                }
                const result =
                    await tutorsCollection.updateOne(
                        {
                            _id: new ObjectId(id),
                        },
                        {
                            $set: {
                                availableSlots:
                                    currentSlots - 1,
                            },
                        }
                    );
                res.send(result);
            }
        );


        console.log(
            "Pinged your deployment. You successfully connected to MongoDB!"
        );
    } finally {
    }
}


run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hello World!');
});
app.listen(port, () => {
    console.log(
        `Example app listening on port ${port}`
    );
});
