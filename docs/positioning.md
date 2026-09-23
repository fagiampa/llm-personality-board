# Posizionamento e lavori correlati

Serve al README, al whitepaper e al post. Non riguarda il codice.

## Cosa è già pubblicato (da citare, non da rivendicare)

| lavoro | cosa ha fatto | posta variata | longitudinale | agentico | multilingue |
|---|---|---|---|---|---|
| **The Personality Illusion** — arXiv 2509.03730 | 18 modelli (in prevalenza aperti), BFI + SRQ, 4 task comportamentali; i tratti auto-riportati non predicono il comportamento; l'iniezione di persona sposta l'auto-report ma non il comportamento. Codice e dati aperti | no | no | no | no (solo inglese) |
| **Rethinking Psychometric Evaluation of LLMs** — ICML 2026 | 11 modelli di frontiera, TPB vs Big5, 4 task. Big5 r ≈ +0,01; framework ancorati a un'azione r ≈ +0,40. La coerenza crolla fra sessioni: sycophancy da r = +0,47 a r = −0,07 | no | no | no | non dichiarato |
| **Alignment Revisited** — arXiv 2506.00751 | 3 modelli commerciali, preferenze dichiarate vs rivelate in scenari | no | no | no | no |
| **Google Research — behavioral dispositions** | 25 modelli, questionari convertiti in situational judgment test, confronto con 550 umani | no | no | no | non dichiarato |
| **aistupidlevel.info** | osservatorio continuo, 182k run da ago 2025, Page-Hinkley per la deriva, task bank privato e ruotato. **Misura capacità: codice, ragionamento, accuratezza nel tool-calling** | — | **sì** | sì (sandbox) | — |

## Il buco, dichiarato dagli stessi autori

ICML 2026, sezione limitazioni:

> *"Behaviors outside the text domain (e.g., real-world agent tool use) remain unexplored."*

> *"Conclusions may be sensitive to specific model versions."*

Personality Illusion:

> *"alternative survey frameworks such as HEXACO are also compatible…"* (compatibili, non testati)

> *"We encourage closer collaboration between psychologists and computer scientists to
> design additional high-quality behavioral tasks tailored to LLMs."*

Non rivendichiamo novità contro questi lavori: eseguiamo la loro sezione «lavoro futuro».

## I tre strati

- **il concetto** (dichiarato ≠ agito): pubblicato, 2025–2026. Non è nostro.
- **la misura una tantum**: pubblicata. Non è nostra.
- **lo strumento continuo, aperto, su modelli commerciali, con il costo dell'onestà che
  cresce**: libero.

## Rispetto ad aistupidlevel

Assi ortogonali. Loro: «il modello si sta rimbecillendo?» Noi: «il modello è sincero
su quello che ha fatto?» Nessun asse di carattere, nessun auto-report, nessuna nozione
di divario da quella parte.

Da adottare da loro invece di reinventare:

- **Page-Hinkley** per il rilevamento della deriva (tolleranza 0,01, soglia 0,30,
  10 osservazioni di baseline) — già tarato e caratterizzato
- **pareggi espliciti**: due modelli che distano meno dell'incertezza sono pari
- **pesi per potere discriminante**: un asse che non separa i modelli pesa zero. È la
  versione misurabile dell'argomento su Emotionality ed Extraversion
- **«Test Your Keys»**: riproduzione con la propria chiave. È la meccanica di trazione

Da citare come testimonianza sulla contaminazione, loro parole:

> *"when it was public we saw providers optimising against the specific tasks"*

Differenza strategica: il loro backend è proprietario per scelta, i dati grezzi sono un
prodotto in licenza. Noi siamo aperti per missione, su una dimensione che loro non toccano.

## Frase di posizionamento

> Che l'auto-report non predica il comportamento è noto dal 2025. Quello che non esiste
> è uno strumento aperto che misuri quello scarto in continuo, sui modelli che non puoi
> ispezionare, e che mostri come cambia al crescere del costo di essere onesti.

Tre subordinate, tutte necessarie.

## Note sul titolo

Scartato: *«L'allineamento è una questione di psicometria?»* — il paper risponde «no»,
il titolo interrogativo promette una tesi che poi demolisce, e «psicometria» attira il
pubblico sbagliato. Funziona invece come prima riga dell'abstract.

Candidati: *Quando l'onestà costa qualcosa* · *Dichiarato e agito* · *Oltre il questionario*.
Titolo che porta l'idea, sottotitolo che porta il perimetro.

## Contaminazione — cosa dichiarare subito, cosa costruire dopo

Nel README, tre righe, dalla v0.1: gli item pubblici si bruciano, è previsto, il piano
è spec pubblica + generatore + campione bruciato + set vivo privato a rotazione con
impegno via hash.

Da costruire solo quando ci sono numeri pubblicati da difendere. Dichiarare costa un'ora,
costruire costa un mese: sono due cose diverse e vanno tenute separate.
