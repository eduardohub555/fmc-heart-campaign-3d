"""Curated knowledge base for the Teacher agent.

Every fact the Teacher may state comes from here, each tied to a public,
reputable source. The Teacher must cite source ids, and the backend drops any
id it does not recognise, so a citation cannot be invented.
"""

from __future__ import annotations

SOURCES: dict[str, dict[str, str]] = {
    "who-cvd": {
        "title": "Cardiovascular diseases (CVDs) — fact sheet",
        "publisher": "World Health Organization",
        "url": "https://www.who.int/news-room/fact-sheets/detail/cardiovascular-diseases-(cvds)",
    },
    "who-salt": {
        "title": "Sodium reduction — fact sheet",
        "publisher": "World Health Organization",
        "url": "https://www.who.int/news-room/fact-sheets/detail/sodium-reduction",
    },
    "who-activity": {
        "title": "Physical activity — fact sheet",
        "publisher": "World Health Organization",
        "url": "https://www.who.int/news-room/fact-sheets/detail/physical-activity",
    },
    "inegi-deaths": {
        "title": "Estadísticas de Defunciones Registradas (EDR) 2024",
        "publisher": "INEGI",
        "url": "https://www.inegi.org.mx/programas/edr/",
    },
    "aha-heart-attack": {
        "title": "Warning Signs of a Heart Attack",
        "publisher": "American Heart Association",
        "url": "https://www.heart.org/en/health-topics/heart-attack/warning-signs-of-a-heart-attack",
    },
    "aha-le8": {
        "title": "Life's Essential 8 — How to get healthy sleep",
        "publisher": "American Heart Association",
        "url": "https://www.heart.org/en/healthy-living/healthy-lifestyle/lifes-essential-8",
    },
    "aha-cpr": {
        "title": "Hands-Only CPR",
        "publisher": "American Heart Association",
        "url": "https://cpr.heart.org/en/cpr-courses-and-kits/hands-only-cpr",
    },
    "aha-chd": {
        "title": "About Congenital Heart Defects",
        "publisher": "American Heart Association",
        "url": "https://www.heart.org/en/health-topics/congenital-heart-defects/about-congenital-heart-defects",
    },
    "nhlbi-surgery": {
        "title": "Heart Surgery (overview, what to expect during surgery, recovery)",
        "publisher": "U.S. National Heart, Lung, and Blood Institute (NIH)",
        "url": "https://www.nhlbi.nih.gov/health/heart-surgery",
    },
    "aha-valves": {
        "title": "Heart Valve Problems and Disease / Heart Valve Surgery",
        "publisher": "American Heart Association",
        "url": "https://www.heart.org/en/health-topics/heart-valve-problems-and-disease",
    },
    "who-rhd": {
        "title": "Rheumatic heart disease — fact sheet",
        "publisher": "World Health Organization",
        "url": "https://www.who.int/news-room/fact-sheets/detail/rheumatic-heart-disease",
    },
    "incich-chd": {
        "title": "Congenital heart disease in Mexico (review articles, Archivos de Cardiología de México)",
        "publisher": "Instituto Nacional de Cardiología Ignacio Chávez",
        "url": "https://www.archivoscardiologia.com/",
    },
    "incich": {
        "title": "Instituto Nacional de Cardiología Ignacio Chávez",
        "publisher": "Gobierno de México",
        "url": "https://www.cardiologia.org.mx/",
    },
    "sat-donatarias": {
        "title": "Directorio de donatarias autorizadas / deducciones personales",
        "publisher": "SAT (Servicio de Administración Tributaria)",
        "url": "https://www.sat.gob.mx/",
    },
    "fmc-social": {
        "title": "Fundación Mexicana del Corazón — official social networks",
        "publisher": "Fundación Mexicana del Corazón",
        "url": "https://www.facebook.com/fundacionmexicanadelcorazon/ | https://www.instagram.com/fundacioncoramexico/",
    },
    "campaign": {
        "title": "Heart-surgery campaign for people with low resources",
        "publisher": "Fundación Mexicana del Corazón",
        "url": "about:campaign",
    },
}

TOPICS = [
    "heart_disease_basics",
    "mexico_statistics",
    "risk_factors",
    "prevention",
    "heart_attack_signs",
    "cpr_emergency",
    "congenital_heart_disease",
    "valve_disease",
    "heart_surgery",
    "recovery",
    "children_heart_health",
    "how_donations_work",
    "tax_receipts",
    "institute_history",
    "reported_error",
    "other",
]

FACTS = """
[who-cvd] Cardiovascular diseases (CVDs) are a group of disorders of the heart and blood vessels and are the leading cause of death globally, taking an estimated 17.9 million lives each year. Most CVD deaths are from heart attacks and strokes. Key behavioural risk factors: unhealthy diet, physical inactivity, tobacco use and harmful use of alcohol. These can show up as raised blood pressure, raised blood glucose, raised blood lipids, and overweight/obesity. Many CVDs can be prevented by addressing these risk factors; early detection helps treatment start early.
[inegi-deaths] In Mexico, heart diseases ("enfermedades del corazón") are the leading cause of death. INEGI's 2024 registered-deaths statistics report roughly 190,000 deaths from heart disease out of roughly 820,000 total deaths — about 1 in every 4 deaths (≈23–24%). Diabetes and malignant tumours follow. Exact figures differ slightly between preliminary and final reports.
[who-salt] WHO recommends adults eat less than 5 g of salt per day (just under a teaspoon). Too much sodium raises blood pressure, a major risk factor for heart disease and stroke.
[who-activity] WHO recommends adults do at least 150–300 minutes of moderate-intensity aerobic activity per week (or 75–150 minutes vigorous); children and adolescents an average of 60 minutes per day of moderate-to-vigorous activity.
[aha-heart-attack] Heart attack warning signs: chest discomfort (pressure, squeezing, fullness or pain, lasting more than a few minutes or coming back); discomfort in one or both arms, back, neck, jaw or stomach; shortness of breath; cold sweat, nausea or light-headedness. Women are somewhat more likely than men to have shortness of breath, nausea/vomiting and back or jaw pain. Call emergency services immediately (in Mexico dial 911); minutes matter.
[aha-le8] The American Heart Association counts sleep among "Life's Essential 8" for heart health: adults should aim for 7 to 9 hours of sleep per night; children and teens need more. Poor sleep is linked to higher risk of high blood pressure, obesity and heart disease.
[aha-cpr] Hands-Only CPR for a teen or adult who suddenly collapses: (1) call 911, (2) push hard and fast in the center of the chest at 100–120 compressions per minute until help arrives. An AED (automatic external defibrillator) should be used as soon as available.
[aha-chd] Congenital heart defects are problems with the heart's structure present at birth; they are the most common type of birth defect. Some are simple and need no treatment (or close on their own); others need catheter procedures or surgery, sometimes several over a lifetime. Many children with treated defects grow up to live full lives, with ongoing check-ups by a cardiologist. A large ventricular septal defect (a hole between the heart's lower chambers) makes the heart and lungs work harder; babies and children may breathe fast, tire easily (for example during feeding or play) and gain weight poorly. Small ones may close on their own; large ones are often closed with surgery or a catheter procedure.
[incich-chd] Review articles from the Instituto Nacional de Cardiología estimate that between about 12,000 and 16,000 children are born each year in Mexico with some type of congenital heart disease; it is among the leading causes of death in children under 1 and from 1 to 4 years. Real national prevalence is not precisely known.
[aha-valves] Heart valves keep blood flowing in one direction. The aortic valve opens to let blood leave the heart for the rest of the body; the mitral valve lets blood pass from the left upper chamber to the left lower chamber. A valve that is too narrow (stenosis) or leaks (regurgitation) makes the heart work harder. Repair fixes the patient's own valve (in children, a narrow valve is often widened with a balloon on a catheter or repaired surgically). Replacement removes the damaged valve and puts in a new one: a mechanical valve (very durable, but requires lifelong blood-thinning medicine) or a tissue valve made from animal or human tissue (no lifelong blood thinners, but may wear out over the years). Some aortic valves can be replaced through a catheter (TAVR) instead of open-heart surgery.
[who-rhd] Rheumatic heart disease is permanent damage to the heart valves caused by rheumatic fever, which can follow an untreated strep throat infection. It is preventable: treating strep throat with antibiotics prevents rheumatic fever. Advanced valve damage may require valve surgery.
[nhlbi-surgery] Heart surgery treats problems that other treatments cannot. Common types: coronary artery bypass grafting (CABG), which uses a healthy vessel to route blood around a blocked coronary artery; heart valve repair or replacement; repair of congenital defects; arrhythmia treatment, and placement of devices. Recovery usually means several days in hospital, then weeks of gradual return to activity; cardiac rehabilitation (supervised exercise, education, counselling) improves recovery. Risks exist and are discussed with the care team. Pain: for open-heart surgery the patient is given anesthesia, a medicine that makes them unconscious and unaware of pain, so they do not feel the operation. Afterwards, discomfort and some pain are normal (for example chest and muscle pain, or pain at a leg incision after bypass); the care team prescribes medicine to ease it, and patients or parents should tell the care team if pain is not controlled. Minimally invasive surgery may mean lower pain levels during recovery than open-heart surgery. Pain medicine can cause constipation. Before going home, the team explains how to care for the healing incisions and when to call them right away.
[incich] The Instituto Nacional de Cardiología was founded by Dr. Ignacio Chávez and inaugurated on 18 April 1944 in Mexico City; it is considered the first institute in the world dedicated exclusively to cardiology. Its motto, shown on its mosaic emblem, is "Amor scientia que inserviant cordi" (love and science at the service of the heart). It houses murals by Diego Rivera on the history of cardiology (1944). The current campus is in Tlalpan, Mexico City. It provides specialized care, teaching and research.
[fmc-social] The Fundación Mexicana del Corazón shares heart-health education and campaigns on its official Facebook and Instagram accounts. For details of any specific current campaign, visitors should check those official accounts directly; this app does not reproduce their posts.
[sat-donatarias] Fundación Mexicana del Corazón is a SAT-authorized donee ("donataria autorizada"), so donations to its campaign can be tax-deductible and donors receive a CFDI (electronic tax receipt) by email. For individuals, deductible donations are generally capped at 7% of the previous year's taxable income. A tax advisor can confirm how this applies to someone's personal situation.
[campaign] Fundación Mexicana del Corazón is running a campaign to help people with low resources fund heart surgery. One heart surgery costs about 200,000 MXN. Donors can give any amount, once or monthly. Each donor is linked with one patient helped by the campaign, who will be eternally grateful to them and will send them a personal thank-you letter. Every amount matters: small donations add up, and many small steps get a patient to their surgery. Each donor is linked with one campaign patient (the one with the least funding so far), who writes them letters. The surgeries are performed by the Instituto Nacional de Cardiología; the foundation raises the funds and pays for each surgery patient by patient, following the medical priority set by the Instituto Nacional de Cardiología (who needs the resources sooner). When describing this, keep that warm wording ("will be eternally grateful to you and will send you a personal thank-you letter").
""".strip()


# Closing reminders shown when a conversation ends (no model call, all sourced).
HEALTH_TIPS: dict[str, dict[str, str]] = {
    "sleep": {
        "en": "Remember to sleep 7 to 9 hours every night. Good sleep helps keep your heart healthy.",
        "es": "Recuerda dormir de 7 a 9 horas cada noche. Dormir bien ayuda a mantener tu corazón sano.",
        "source": "aha-le8",
    },
    "salt": {
        "en": "Remember to eat less than 5 grams of salt a day (just under a teaspoon) to help keep your blood pressure healthy.",
        "es": "Recuerda comer menos de 5 gramos de sal al día (poco menos de una cucharadita) para cuidar tu presión arterial.",
        "source": "who-salt",
    },
    "activity": {
        "en": "Remember to move at least 150 minutes a week. For example, a brisk 30-minute walk 5 days a week.",
        "es": "Recuerda moverte al menos 150 minutos a la semana. Por ejemplo, caminar a paso rápido 30 minutos, 5 días a la semana.",
        "source": "who-activity",
    },
    "kids_activity": {
        "en": "Remember that children need about 60 minutes of active play every day for a healthy heart (kids with a heart condition should follow their cardiologist's advice).",
        "es": "Recuerda que niñas y niños necesitan unos 60 minutos de juego activo al día para un corazón sano (si tienen una condición del corazón, sigan las indicaciones de su cardiólogo).",
        "source": "who-activity",
    },
    "tobacco": {
        "en": "Remember: staying away from tobacco is one of the best things you can do for your heart.",
        "es": "Recuerda: alejarte del tabaco es una de las mejores cosas que puedes hacer por tu corazón.",
        "source": "who-cvd",
    },
    "blood_pressure": {
        "en": "Remember to get your blood pressure checked regularly. High blood pressure is a major risk factor for heart disease.",
        "es": "Recuerda medir tu presión arterial con regularidad. La presión alta es un factor de riesgo importante para el corazón.",
        "source": "who-cvd",
    },
    "heart_attack": {
        "en": "Remember the warning signs of a heart attack: chest pressure or pain, discomfort in the arm, back, neck or jaw, shortness of breath. If they appear, call 911 right away.",
        "es": "Recuerda las señales de un infarto: presión o dolor en el pecho, molestia en brazo, espalda, cuello o mandíbula, falta de aire. Si aparecen, llama al 911 de inmediato.",
        "source": "aha-heart-attack",
    },
    "strep": {
        "en": "Remember to take children with a sore throat to the doctor. Treating strep throat with antibiotics prevents rheumatic heart disease.",
        "es": "Recuerda llevar al médico a niñas y niños con dolor de garganta. Tratar la infección por estreptococo con antibióticos previene la enfermedad reumática del corazón.",
        "source": "who-rhd",
    },
}

# Which reminder fits each conversation topic best (first unseen match wins).
TOPIC_TIPS: dict[str, list[str]] = {
    "risk_factors": ["blood_pressure", "salt", "tobacco"],
    "prevention": ["salt", "activity", "sleep"],
    "heart_attack_signs": ["heart_attack"],
    "cpr_emergency": ["heart_attack"],
    "congenital_heart_disease": ["kids_activity"],
    "children_heart_health": ["kids_activity"],
    "valve_disease": ["strep"],
    "heart_surgery": ["sleep", "activity"],
    "recovery": ["sleep", "activity"],
    "mexico_statistics": ["blood_pressure"],
    "heart_disease_basics": ["blood_pressure", "activity"],
}
GENERAL_TIPS = ["sleep", "salt", "activity", "tobacco", "blood_pressure"]


# Plain-language explanations of each campaign procedure, shown when a donor
# clicks the procedure of the patient they are helping.
PROCEDURE_INFO: dict[str, dict[str, str]] = {
    "Surgical closure of the defect": {
        "title_en": "Surgical closure of a ventricular septal defect",
        "title_es": "Cierre quirúrgico de una comunicación interventricular",
        "en": "A ventricular septal defect is a hole in the wall between the heart's two lower chambers. It makes the heart and lungs work harder, so children may breathe fast, tire easily and gain weight slowly. In surgery, the patient is asleep under anesthesia while the surgeon closes the hole with stitches or a small patch. Afterwards blood flows the normal way, and many children grow up to live full, active lives with regular check-ups.",
        "es": "Una comunicación interventricular es un orificio en la pared entre las dos cavidades inferiores del corazón. Hace que el corazón y los pulmones trabajen de más, por lo que los niños pueden respirar rápido, cansarse fácilmente y subir poco de peso. En la cirugía, el paciente está dormido con anestesia mientras el cirujano cierra el orificio con puntos o un pequeño parche. Después la sangre fluye de forma normal y muchos niños crecen con una vida plena y activa, con revisiones periódicas.",
        "source": "American Heart Association",
    },
    "Coronary artery bypass surgery": {
        "title_en": "Coronary artery bypass surgery",
        "title_es": "Cirugía de puentes coronarios (bypass)",
        "en": "Coronary arteries carry blood to the heart muscle. When one is blocked, part of the heart doesn't get enough oxygen, which can cause a heart attack. In bypass surgery, the surgeon takes a healthy blood vessel from the leg, arm or chest and connects it around the blockage, creating a new path for blood to reach the heart. Patients usually stay several days in the hospital and recover over weeks, helped by cardiac rehabilitation.",
        "es": "Las arterias coronarias llevan sangre al músculo del corazón. Cuando una se bloquea, parte del corazón no recibe suficiente oxígeno, lo que puede causar un infarto. En la cirugía de puentes coronarios, el cirujano toma un vaso sanguíneo sano de la pierna, el brazo o el pecho y lo conecta rodeando el bloqueo, creando un nuevo camino para que la sangre llegue al corazón. Normalmente el paciente pasa varios días en el hospital y se recupera en semanas, con ayuda de la rehabilitación cardiaca.",
        "source": "U.S. National Heart, Lung, and Blood Institute (NIH)",
    },
    "Mitral valve replacement": {
        "title_en": "Mitral valve replacement",
        "title_es": "Reemplazo de la válvula mitral",
        "en": "The mitral valve lets blood pass from the heart's left upper chamber to the left lower chamber. Rheumatic fever in childhood can scar it so it no longer opens or closes well, which causes shortness of breath and tiredness. In this surgery, the damaged valve is removed and a new one is put in: either a mechanical valve (very durable, with lifelong blood-thinning medicine) or a tissue valve. The patient is asleep under anesthesia, and the new valve lets the heart pump efficiently again.",
        "es": "La válvula mitral deja pasar la sangre de la cavidad superior izquierda del corazón a la inferior izquierda. La fiebre reumática en la infancia puede dejarle cicatrices, de modo que ya no abre ni cierra bien, lo que causa falta de aire y cansancio. En esta cirugía se retira la válvula dañada y se coloca una nueva: mecánica (muy duradera, con medicamento anticoagulante de por vida) o de tejido. El paciente está dormido con anestesia, y la nueva válvula permite que el corazón vuelva a bombear con eficiencia.",
        "source": "American Heart Association",
    },
    "Aortic valve repair": {
        "title_en": "Aortic valve repair",
        "title_es": "Reparación de la válvula aórtica",
        "en": "The aortic valve opens with every heartbeat to let blood leave the heart for the rest of the body. When it is too narrow (stenosis), the heart has to push much harder, which can cause dizziness, chest pain or fainting. Repair fixes the patient's own valve so it opens properly: in young people this is often done by widening the valve with a balloon on a thin tube (catheter) or with surgery. Many patients need follow-up over the years, as the valve may need more treatment later.",
        "es": "La válvula aórtica se abre con cada latido para que la sangre salga del corazón hacia el resto del cuerpo. Cuando es demasiado estrecha (estenosis), el corazón tiene que empujar con mucha más fuerza, lo que puede causar mareos, dolor de pecho o desmayos. La reparación arregla la propia válvula del paciente para que abra bien: en jóvenes suele hacerse ensanchándola con un globo en un tubo delgado (catéter) o con cirugía. Muchos pacientes necesitan seguimiento con los años, porque la válvula puede requerir más tratamiento después.",
        "source": "American Heart Association",
    },
    "Aortic valve replacement": {
        "title_en": "Aortic valve replacement",
        "title_es": "Reemplazo de la válvula aórtica",
        "en": "The aortic valve lets blood leave the heart for the rest of the body. When it is badly narrowed or leaks, the heart becomes overworked, causing shortness of breath, chest pain or fainting. In this surgery, the damaged valve is replaced with a new one: a mechanical valve (very durable, with lifelong blood-thinning medicine) or a tissue valve. It is usually done with open-heart surgery under anesthesia; for some patients it can be done through a catheter (TAVR). Afterwards, most people breathe more easily and regain energy.",
        "es": "La válvula aórtica deja salir la sangre del corazón hacia el resto del cuerpo. Cuando está muy estrecha o tiene fugas, el corazón se sobrecarga y aparecen falta de aire, dolor de pecho o desmayos. En esta cirugía se reemplaza la válvula dañada por una nueva: mecánica (muy duradera, con anticoagulante de por vida) o de tejido. Normalmente se hace con cirugía a corazón abierto bajo anestesia; en algunos pacientes puede hacerse por catéter (TAVR). Después, la mayoría respira mejor y recupera energía.",
        "source": "American Heart Association",
    },
}


def known_source_ids(ids: list[str]) -> list[str]:
    return [i for i in dict.fromkeys(ids) if i in SOURCES]
