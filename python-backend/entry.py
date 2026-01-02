import uvicorn
import os
import sys

# Add the current directory to sys.path to ensure modules can be imported
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import app

if __name__ == "__main__":
    # Run the uvicorn server
    # We use port 8000 as expected by the frontend
    uvicorn.run(app, host="127.0.0.1", port=51034)
