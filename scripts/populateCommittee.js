import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Committee from '../models/Committee.js';
import { connectDatabase } from '../config/database.js';

dotenv.config();

const committeeData = [
    {
        name: "Prof. Dr. Azham Hussain",
        role: "Conference Chair",
        affiliation: "School of Computing, Universiti Utara Malaysia",
        country: "Malaysia",
        designation: "Professor",
        order: 1
    },
    {
        name: "Dr. S. Sridhar",
        role: "Conference Co-Chair",
        affiliation: "Department of Computing Technologies, SRM Institute of Science and Technology",
        country: "India",
        order: 2
    },
    {
        name: "Dr. K. Ganesh Kumar",
        role: "Conference Co-Chair",
        affiliation: "Department of Data Science and Business Systems, SRM Institute of Science and Technology",
        country: "India",
        order: 3
    },
    {
        name: "Prof. Dr. Vishnu Kumar Kaliappan",
        role: "Conference Co-Chair",
        affiliation: "Department of Computer Science and Engineering, KPR Institute of Engineering and Technology",
        country: "India",
        designation: "Professor",
        order: 4
    },
    {
        name: "Dr. Manikanthan S.V.",
        role: "Organizing Chair",
        affiliation: "Society for Cyber Intelligent System",
        country: "India",
        designation: "President",
        order: 5
    },
    {
        name: "Dr. Swetha Indudhar Goudar",
        role: "Technical Program Chair",
        affiliation: "KLS Gogte Institute of Technology, Belagavi",
        country: "India",
        designation: "Professor / Research Dean",
        order: 6
    },
    {
        name: "Dr. V. Sakthivel",
        role: "Technical Program Chair",
        affiliation: "Vellore Institute of Technology – Chennai Campus",
        country: "India",
        designation: "Associate Professor",
        order: 7
    },
    {
        name: "Dr. Shanmugam Ramasamy",
        role: "Technical Program Chair",
        affiliation: "Vellore Institute of Technology, Vellore",
        country: "India",
        designation: "Assistant Professor",
        order: 8
    },
    {
        name: "Dr. T. Padmapriya",
        role: "Publication Chair",
        affiliation: "Melange Publications",
        country: "India",
        designation: "Managing Director",
        order: 9
    },
    {
        name: "Dr. T. Karthick",
        role: "Publicity Chair",
        affiliation: "Department of Data Science and Business Systems, SRM Institute of Science and Technology",
        country: "India",
        designation: "Associate Professor",
        order: 10
    },
    {
        name: "Dr. R. Jeyaraj",
        role: "Publicity Chair",
        affiliation: "Department of Data Science and Business Systems, SRM Institute of Science and Technology",
        country: "India",
        designation: "Assistant Professor",
        order: 11
    },
    {
        name: "Mr. Christopher",
        role: "Local Arrangement Chair",
        affiliation: "Department of Computing Technologies, SRM Institute of Science and Technology",
        country: "India",
        designation: "Assistant Professor",
        order: 12
    },
    {
        name: "Dr. Susana Gómez Martínez",
        role: "Advisory Board",
        affiliation: "Universidad de Valladolid, Campus Universitario Duques de Soria",
        country: "Spain",
        designation: "Faculty",
        order: 13
    },
    {
        name: "Dr. Sam Goundar",
        role: "Advisory Board",
        affiliation: "RMIT University",
        country: "Vietnam",
        designation: "Senior Lecturer in Information Technology",
        order: 14
    },
    {
        name: "Ts. Dr. Tan Kian Lam",
        role: "Advisory Board",
        affiliation: "Wawasan Open University",
        country: "Malaysia",
        designation: "Associate Professor",
        order: 15
    },
    {
        name: "Dr. Dugki Min",
        role: "Advisory Board",
        affiliation: "School of Computer Science and Engineering, Konkuk University",
        country: "South Korea",
        designation: "Professor",
        order: 16
    },
    {
        name: "Dr. Sujit Jagtap",
        role: "Advisory Board",
        affiliation: "University of Illinois at Urbana-Champaign",
        country: "United States",
        designation: "Research Scientist",
        order: 17
    },
    {
        name: "Dr. Manish K. Tiwari",
        role: "Advisory Board",
        affiliation: "Novonesis",
        country: "Denmark",
        designation: "Senior Scientist",
        order: 18
    },
    {
        name: "Dr. Sajeesh Kappachery",
        role: "Advisory Board",
        affiliation: "United Arab Emirates University",
        country: "UAE",
        designation: "Postdoctoral Fellow",
        order: 19
    },
    {
        name: "Dr. K. Mohanasundaram",
        role: "Advisory Board",
        affiliation: "KPR Institute of Engineering and Technology",
        country: "India",
        designation: "Professor and Head",
        order: 20
    },
    {
        name: "Dr. M. Rajasekar",
        role: "Advisory Board",
        affiliation: "Saveetha School of Engineering, Saveetha University",
        country: "India",
        designation: "Associate Professor",
        order: 21
    },
    {
        name: "Dr. A. Murugan",
        role: "Conference Coordinators",
        affiliation: "Department of Data Science and Business Systems, SRM Institute of Science and Technology",
        country: "India",
        designation: "Professor",
        order: 22
    },
    {
        name: "Dr. A. Syed Ismail",
        role: "Conference Coordinators",
        affiliation: "Department of Data Science and Business Systems, SRM Institute of Science and Technology",
        country: "India",
        designation: "Assistant Professor",
        order: 23
    },
    {
        name: "Dr. John Deva Prasanna D S",
        role: "Committee Members",
        affiliation: "Department of Data Science and Business Systems, SRM Institute of Science and Technology",
        country: "India",
        designation: "Assistant Professor",
        order: 24
    },
    {
        name: "Dr. K. Priyadarshini",
        role: "Committee Members",
        affiliation: "Department of Data Science and Business Systems, SRM Institute of Science and Technology",
        country: "India",
        designation: "Associate Professor",
        order: 25
    },
    {
        name: "Dr. J. Jebasonia",
        role: "Committee Members",
        affiliation: "Department of Data Science and Business Systems, SRM Institute of Science and Technology",
        country: "India",
        designation: "Associate Professor",
        order: 26
    },
    {
        name: "Dr. Safa",
        role: "Committee Members",
        affiliation: "Department of Networking and Communications, SRM Institute of Science and Technology",
        country: "India",
        designation: "Assistant Professor",
        order: 27
    },
    {
        name: "Dr. Rajalakshmi",
        role: "Committee Members",
        affiliation: "Department of Networking and Communications, SRM Institute of Science and Technology",
        country: "India",
        order: 28
    },
    {
        name: "Dr. P. Saravanan",
        role: "Committee Members",
        affiliation: "Department of Computing Technologies, SRM Institute of Science and Technology",
        country: "India",
        designation: "Assistant Professor",
        order: 29
    },
    {
        name: "Dr. Lubin Balasubramanian",
        role: "Committee Members",
        affiliation: "Department of Computing Technologies, SRM Institute of Science and Technology",
        country: "India",
        designation: "Assistant Professor",
        order: 30
    },
    {
        name: "Dr. B. Muruganantham",
        role: "Committee Members",
        affiliation: "Department of Computing Technologies, SRM Institute of Science and Technology",
        country: "India",
        designation: "Associate Professor",
        order: 31
    },
    {
        name: "Dr. T.K. Sivakumar",
        role: "Committee Members",
        affiliation: "Department of Computing Technologies, SRM Institute of Science and Technology",
        country: "India",
        designation: "Assistant Professor (Sr.Gr)",
        order: 32
    },
    {
        name: "Dr. Mukesh Krishnan",
        role: "Committee Members",
        affiliation: "Department of Networking and Communications, SRM Institute of Science and Technology",
        country: "India",
        designation: "Professor",
        order: 33
    },
    {
        name: "Dr. Saravanan",
        role: "Committee Members",
        affiliation: "Department of Computing Technologies, SRM Institute of Science and Technology",
        country: "India",
        designation: "Associate Professor",
        order: 34
    },
    {
        name: "Dr. Kowsigan M",
        role: "Committee Members",
        affiliation: "Department of Computing Technologies, SRM Institute of Science and Technology",
        country: "India",
        designation: "Associate Professor",
        order: 35
    },
    {
        name: "Dr. Fancy C",
        role: "Committee Members",
        affiliation: "Department of Networking and Communications, SRM Institute of Science and Technology",
        country: "India",
        designation: "Assistant Professor",
        order: 36
    },
    {
        name: "R. Indumathi",
        role: "Committee Members",
        affiliation: "Manakula Vinayagar Institute of Technology",
        country: "India",
        designation: "Assistant Professor",
        order: 37
    },
    {
        name: "M. Viji",
        role: "Committee Members",
        affiliation: "Manakula Vinayagar Institute of Technology",
        country: "India",
        order: 38
    },
    {
        name: "Dr. Shobana Devi A",
        role: "Committee Members",
        affiliation: "Department of Data Science and Business Systems, SRM Institute of Science and Technology",
        country: "India",
        designation: "Associate Professor",
        order: 39
    },
    {
        name: "Dr. T. Veeramakali",
        role: "Committee Members",
        affiliation: "Department of Data Science and Business Systems, SRM Institute of Science and Technology",
        country: "India",
        designation: "Associate Professor",
        order: 40
    }
];

async function populateCommittee() {
    try {
        // Connect to MongoDB
        await connectDatabase();

        // Clear existing committee data
        await Committee.deleteMany({});
        console.log('🗑️  Cleared existing committee data');

        // Insert new data
        const result = await Committee.insertMany(committeeData);
        console.log(`✅ Successfully added ${result.length} committee members`);

        // Display summary
        const summary = await Committee.aggregate([
            { $group: { _id: '$role', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        console.log('\n📊 Committee Summary:');
        summary.forEach(item => {
            console.log(`   ${item._id}: ${item.count} members`);
        });

        console.log('\n✨ Committee data populated successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error populating committee data:', error);
        process.exit(1);
    }
}

populateCommittee();
