# Dimension Chess VR - Project Setup Guide

## Prerequisites

### Required Software
- **Unity 2023.3 LTS** (Latest patch version)
- **Visual Studio 2022** or **JetBrains Rider**
- **Git** for version control
- **Meta Quest Developer Hub** (for device testing)
- **Android Studio** (for Android build tools)

### Hardware Requirements
- **Development PC**: Windows 10/11 with 16GB+ RAM, GTX 1060+ GPU
- **Meta Quest 2/3/Pro** for testing
- **USB-C cable** for device connection

## Unity Project Setup

### 1. Create New Unity Project
1. Open Unity Hub
2. Click "New Project"
3. Select "3D (URP)" template
4. Set project name: "DimensionChessVR"
5. Choose location: `D:\GitHub\5^3 Chess\UnityProject`
6. Click "Create project"

### 2. Configure Project Settings

#### Build Settings
1. Go to `File > Build Settings`
2. Switch platform to `Android`
3. Set minimum API level to `Android 10.0 (API level 29)`
4. Enable `Custom Main Manifest`

#### Player Settings
1. Go to `Edit > Project Settings > Player`
2. **Android Settings**:
   - Package Name: `com.yourstudio.dimensionchessvr`
   - Minimum API Level: `Android 10.0 (API level 29)`
   - Target API Level: `Android 13.0 (API level 33)`
   - Scripting Backend: `IL2CPP`
   - Target Architectures: `ARM64`
3. **Other Settings**:
   - Color Space: `Linear`
   - Auto Graphics API: `Disabled`
   - Graphics APIs: `OpenGLES3`, `Vulkan`

#### Quality Settings
1. Go to `Edit > Project Settings > Quality`
2. Set all quality levels to prioritize performance
3. Disable anti-aliasing for mobile
4. Set texture quality to "Full Res"

### 3. Install Required Packages

#### Via Package Manager
1. Go to `Window > Package Manager`
2. Install the following packages:
   - **XR Plugin Management**
   - **Oculus XR Plugin**
   - **XR Interaction Toolkit**
   - **Input System**
   - **TextMeshPro**
   - **Universal Render Pipeline**

#### Via Git URLs
```
com.unity.xr.management
com.unity.xr.oculus
com.unity.xr.interaction.toolkit
com.unity.inputsystem
com.unity.textmeshpro
com.unity.render-pipelines.universal
```

### 4. Configure XR Settings
1. Go to `Edit > Project Settings > XR Plug-in Management`
2. Enable `Oculus` plugin
3. Go to `Oculus` settings:
   - Enable `Low Overhead Mode`
   - Enable `Optimize Buffer Discards`
   - Set `Display Mode` to `Single Pass Instanced`

## Meta XR SDK Setup

### 1. Import Oculus Integration
1. Download Oculus Integration from Asset Store
2. Import the package
3. Accept all default settings during import

### 2. Configure Oculus Settings
1. Go to `Oculus > Tools > Oculus Utilities > Oculus Project Setup Tool`
2. Run the setup tool
3. Enable all recommended settings

### 3. Set Up OVRCameraRig
1. Create empty GameObject named "OVRCameraRig"
2. Add `OVRCameraRig` component
3. Configure tracking space settings

## Project Structure Setup

### 1. Create Folder Structure
```
Assets/
├── Scripts/
│   ├── Core/
│   ├── VR/
│   ├── Networking/
│   ├── AI/
│   ├── UI/
│   └── Utils/
├── Prefabs/
│   ├── Pieces/
│   ├── UI/
│   └── VR/
├── Materials/
├── Models/
├── Textures/
├── Audio/
├── Scenes/
└── Resources/
```

### 2. Create Base Scripts
Create the following base scripts in `Assets/Scripts/Core/`:

#### GameManager.cs
```csharp
using UnityEngine;
using UnityEngine.Events;

public class GameManager : MonoBehaviour
{
    public static GameManager Instance { get; private set; }
    
    [SerializeField] private GameState currentState;
    public UnityEvent<GameState> OnStateChanged;
    
    private void Awake()
    {
        if (Instance == null)
        {
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }
        else
        {
            Destroy(gameObject);
        }
    }
    
    public void ChangeState(GameState newState)
    {
        currentState = newState;
        OnStateChanged?.Invoke(newState);
    }
}

public enum GameState
{
    MainMenu,
    Tutorial,
    Playing,
    Paused,
    GameOver,
    Spectating
}
```

#### BoardManager.cs
```csharp
using UnityEngine;
using System.Collections.Generic;

public class BoardManager : MonoBehaviour
{
    public static BoardManager Instance { get; private set; }
    
    [SerializeField] private GameObject boardCellPrefab;
    [SerializeField] private Vector3 boardCenter = Vector3.zero;
    [SerializeField] private float cellSize = 1f;
    
    private GameObject[,,] boardCells = new GameObject[5, 5, 5];
    private Board3D boardData;
    
    private void Awake()
    {
        if (Instance == null)
            Instance = this;
        else
            Destroy(gameObject);
            
        InitializeBoard();
    }
    
    private void InitializeBoard()
    {
        boardData = new Board3D();
        CreateBoardVisuals();
    }
    
    private void CreateBoardVisuals()
    {
        for (int x = 0; x < 5; x++)
        {
            for (int y = 0; y < 5; y++)
            {
                for (int z = 0; z < 5; z++)
                {
                    Vector3 position = boardCenter + new Vector3(x * cellSize, y * cellSize, z * cellSize);
                    GameObject cell = Instantiate(boardCellPrefab, position, Quaternion.identity, transform);
                    boardCells[x, y, z] = cell;
                }
            }
        }
    }
    
    public Vector3 GetWorldPosition(Vector3Int boardPosition)
    {
        return boardCenter + new Vector3(
            boardPosition.x * cellSize,
            boardPosition.y * cellSize,
            boardPosition.z * cellSize
        );
    }
}
```

## Networking Setup (Photon Fusion)

### 1. Install Photon Fusion
1. Go to `Window > Package Manager`
2. Add package from Git URL: `com.photon.fusion`
3. Install Photon Fusion 2.0

### 2. Configure Photon Settings
1. Go to `Fusion > Photon Server Settings`
2. Set your Photon App ID
3. Configure region settings

### 3. Create Network Manager
```csharp
using Fusion;
using UnityEngine;

public class NetworkManager : MonoBehaviour, INetworkRunnerCallbacks
{
    [SerializeField] private NetworkRunner networkRunner;
    [SerializeField] private NetworkPrefabRef playerPrefab;
    
    private Dictionary<PlayerRef, NetworkObject> spawnedCharacters = new Dictionary<PlayerRef, NetworkObject>();
    
    public async void StartGame(GameMode mode, string roomName)
    {
        networkRunner.ProvideInput = true;
        
        var result = await networkRunner.StartGame(new StartGameArgs()
        {
            GameMode = mode,
            SessionName = roomName,
            Scene = SceneManager.GetActiveScene().buildIndex,
            SceneManager = gameObject.AddComponent<NetworkSceneManagerDefault>()
        });
    }
    
    // Implement INetworkRunnerCallbacks methods...
}
```

## Build Configuration

### 1. Android Build Settings
1. Go to `File > Build Settings`
2. Select `Android` platform
3. Click `Player Settings`
4. Configure:
   - **Package Name**: `com.yourstudio.dimensionchessvr`
   - **Version**: `1.0.0`
   - **Bundle Version Code**: `1`
   - **Minimum API Level**: `Android 10.0`
   - **Target API Level**: `Android 13.0`

### 2. Quest-Specific Settings
1. In Player Settings > Android:
   - **Graphics APIs**: `OpenGLES3`, `Vulkan`
   - **Multithreaded Rendering**: `Enabled`
   - **Static Batching**: `Enabled`
   - **Dynamic Batching**: `Enabled`

### 3. Performance Settings
1. **Quality Settings**:
   - Set all quality levels to mobile-optimized settings
   - Disable anti-aliasing
   - Reduce shadow distance
   - Set texture quality to "Full Res"

## Development Workflow

### 1. Version Control Setup
```bash
# Initialize Git repository
git init
git add .
git commit -m "Initial project setup"

# Create .gitignore for Unity
# Add standard Unity .gitignore content
```

### 2. Development Branches
- `main` - Production-ready code
- `develop` - Integration branch
- `feature/feature-name` - Feature development
- `hotfix/bug-description` - Critical bug fixes

### 3. Testing Workflow
1. **Editor Testing**: Test in Unity Editor with VR simulation
2. **Device Testing**: Test on actual Quest device
3. **Performance Testing**: Use Quest Performance Tester
4. **Multiplayer Testing**: Test with multiple devices

## Performance Optimization

### 1. Quest-Specific Optimizations
- **Draw Calls**: Keep under 100 per frame
- **Texture Memory**: Use compressed textures
- **Polygon Count**: Keep models under 50k triangles
- **Shader Complexity**: Use simple, mobile-optimized shaders

### 2. Frame Rate Targets
- **Quest 3**: 90 FPS target
- **Quest 2**: 72 FPS target
- **Quest Pro**: 90 FPS target

### 3. Memory Management
- **Texture Streaming**: Enable for large textures
- **Object Pooling**: Reuse objects instead of instantiation
- **LOD System**: Use Level of Detail for complex models

## Troubleshooting

### Common Issues
1. **Build Fails**: Check Android SDK installation
2. **VR Not Working**: Verify Oculus Integration setup
3. **Performance Issues**: Use Quest Performance Tester
4. **Networking Errors**: Check Photon App ID and internet connection

### Debug Tools
- **Quest Performance Tester**: Analyze performance metrics
- **Unity Profiler**: Profile CPU and memory usage
- **Oculus Debug Tool**: Monitor VR performance
- **Photon Dashboard**: Monitor network performance

## Next Steps

After completing this setup:

1. **Create Basic Scenes**: Main menu, game scene, tutorial scene
2. **Implement Core Gameplay**: Board, pieces, basic movement
3. **Add VR Interaction**: Controller and hand tracking
4. **Implement AI**: Basic chess engine integration
5. **Add Multiplayer**: Photon Fusion integration
6. **Polish & Optimize**: Performance and user experience

This setup provides a solid foundation for developing Dimension Chess VR in Unity, with all necessary components configured for Meta Quest development. 