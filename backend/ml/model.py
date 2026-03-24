import numpy as np  # type: ignore
from sklearn.feature_extraction.text import TfidfVectorizer  # type: ignore
from sklearn.linear_model import LogisticRegression  # type: ignore

# Define some basic training data
TRAINING_DATA = [
    ("Amazon Purchase - Electronics", "Shopping"),
    ("Target", "Shopping"),
    ("Walmart Groceries", "Food"),
    ("Whole Foods Market", "Food"),
    ("Uber Ride to Airport", "Transport"),
    ("Lyft Ride", "Transport"),
    ("Shell Gas Station", "Transport"),
    ("Electric Bill Payment", "Bills"),
    ("Water Utility", "Bills"),
    ("Internet Provider Comcast", "Bills"),
    ("Starbucks Coffee", "Food"),
    ("McDonalds", "Food"),
    ("Netflix Subscription", "Entertainment"),
    ("Spotify Premium", "Entertainment"),
    ("AMC Theatres", "Entertainment"),
    ("Steam Games", "Entertainment"),
    ("Apple Store", "Shopping"),
    ("Best Buy", "Shopping"),
    ("Monthly Rent", "Bills"),
    ("Gym Membership", "Entertainment"),
    ("Trader Joes", "Food")
]

class ExpenseCategorizer:
    def __init__(self):
        self.vectorizer = TfidfVectorizer(stop_words='english')
        self.classifier = LogisticRegression(random_state=42)
        
        # Train on initialization
        descriptions = [item[0] for item in TRAINING_DATA]
        labels = [item[1] for item in TRAINING_DATA]
        
        X = self.vectorizer.fit_transform(descriptions)
        self.classifier.fit(X, labels)
        
        self.classes = self.classifier.classes_
        
    def predict(self, description: str):
        X_vec = self.vectorizer.transform([description])
        pred_idx = self.classifier.predict(X_vec)[0]
        
        # Get confidence (probability)
        probs = self.classifier.predict_proba(X_vec)[0]
        confidence = round(max(probs) * 100, 2)
        
        # Explainable AI: Get top keywords contributing to the predicted class
        class_idx = np.where(self.classes == pred_idx)[0][0]
        weights = self.classifier.coef_[class_idx]
        feature_names = self.vectorizer.get_feature_names_out()
        
        # Multiply weights by the TF-IDF representation of the input text
        # to find which words in the *input* actually drove the prediction
        contributions = X_vec.toarray()[0] * weights
        
        # Get indices of positive contributions
        top_indices = np.argsort(contributions)[::-1]
        
        # Only keep top 2 words that actually appear in the text and have positive weight
        keywords = []
        for idx in top_indices:
            if contributions[idx] > 0 and len(keywords) < 2:
                keywords.append(feature_names[idx])
                
        return {
            "category": pred_idx,
            "confidence": confidence,
            "keywords": keywords
        }

    def predict_batch(self, descriptions):
        if not descriptions:
            return []
            
        X_vec = self.vectorizer.transform(descriptions)
        pred_idxs = self.classifier.predict(X_vec)
        probs = self.classifier.predict_proba(X_vec)
        
        results = []
        feature_names = self.vectorizer.get_feature_names_out()
        
        # To avoid creating 100,000 dense arrays via .toarray() which blows up RAM
        # we process directly from the scipy sparse format
        
        for i in range(len(descriptions)):
            pred_idx = pred_idxs[i]
            confidence = round(max(probs[i]) * 100, 2)
            
            class_idx = np.where(self.classes == pred_idx)[0][0]
            weights = self.classifier.coef_[class_idx]
            
            # Efficient keyword extraction from sparse row
            row_start = X_vec.indptr[i]
            row_end = X_vec.indptr[i+1]
            col_indices = X_vec.indices[row_start:row_end]
            row_data = X_vec.data[row_start:row_end]
            
            contributions = row_data * weights[col_indices]
            
            # Sort local sparse contributions
            top_local_indices = np.argsort(contributions)[::-1]
            
            keywords = []
            for idx in top_local_indices:
                if contributions[idx] > 0 and len(keywords) < 2:
                    global_col_idx = col_indices[idx]
                    keywords.append(feature_names[global_col_idx])
                    
            results.append({
                "category": str(pred_idx),
                "confidence": float(confidence),
                "keywords": keywords
            })
            
        return results

model = ExpenseCategorizer()
