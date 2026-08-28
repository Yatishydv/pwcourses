import os
import glob

replacements = {
    "'#0f172a'": "'#ffffff'",
    "'#1e293b'": "'#f1f5f9'",
    "'#3b82f6'": "'#e32b2b'",
    "'#f8fafc'": "'#000000'",
    "'#94a3b8'": "'#666666'",
    "'#334155'": "'#cccccc'",
    
    "CloudDrive Sync": "Physics Wallah",
    "Secure file syncing node.": "India's Top E-Learning Platform.",
    "Access ID": "Phone Number / Email",
    "Secret Key": "PIN",
    "Mount Drive": "Login",
    "Initialize Node": "Register",
    "Need a new container? Initialize": "Don't have an account? Register",
    "Have a container? Mount": "Already have an account? Login",
    
    "Protected conversation": "Course Chat",
    "No private conversations yet.": "No courses yet.",
    "Friends": "Batchmates",
    
    "<Text style={styles.icon}>☁️</Text>": "<Image source={require('../../assets/pw-logo.png')} style={{width: 80, height: 80, marginBottom: 16}} resizeMode='contain' />",
}

for filepath in glob.glob('/Users/yatishydv/Desktop/us/mobile/src/**/*.tsx', recursive=True) + ['/Users/yatishydv/Desktop/us/mobile/App.tsx', '/Users/yatishydv/Desktop/us/mobile/app.json']:
    with open(filepath, 'r') as f:
        content = f.read()
    
    if 'LoginScreen.tsx' in filepath and 'import { Image ' not in content:
        content = content.replace("import { View, Text, TextInput,", "import { View, Text, TextInput, Image,")
        
    if 'app.json' in filepath:
        content = content.replace('"name": "mobile"', '"name": "Physics Wallah"')

    for old, new in replacements.items():
        content = content.replace(old, new)
        
    with open(filepath, 'w') as f:
        f.write(content)

print("Done")
